# Flow Watch On Personal GitHub And Linode

This repo is now set up for a personal GitHub repository plus direct Helm-based deployment to Linode Kubernetes.

## 1. Move The Git Remote To Your GitHub Repo

Create an empty GitHub repository first, then point this clone at it:

```sh
git remote -v
git remote rename origin upstream-old
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/flow-watch.git
git push -u origin main
git push origin --tags
```

If you do not need the old remote at all:

```sh
git remote remove upstream-old
```

## 2. Let GitHub Build And Publish Images To GHCR

The GitHub Actions workflow now publishes changed images to GHCR under your GitHub owner automatically:

- `ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-ui`
- `ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-service`
- `ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-batch`

Before the first push, enable package publishing permissions for Actions if your repo policy requires it.

You can also build and push manually:

```sh
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-ui:latest ./UI
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-service:latest ./service
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-batch:latest ./batch
docker push ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-ui:latest
docker push ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-service:latest
docker push ghcr.io/YOUR_GITHUB_USERNAME/flow-watch-batch:latest
```

If your GHCR packages stay private, create an image pull secret in the cluster and set `imagePullSecrets` in the values files.

## 3. Prepare Your Linode Cluster

Use your Linode kubeconfig locally, then create the target namespace:

```sh
kubectl config current-context
kubectl create namespace flow-watch
```

Install ingress-nginx:

```sh
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer
```

Install cert-manager:

```sh
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true
```

Create a production issuer after cert-manager is up:

```sh
cat <<'EOF' | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: production
spec:
  acme:
    email: YOUR_EMAIL@example.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: production-acme-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

## 4. Install MongoDB

Install a standalone MongoDB release into the same namespace:

```sh
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm upgrade --install flow-watch-mongodb bitnami/mongodb \
  --namespace flow-watch \
  --set architecture=standalone \
  --set auth.rootUser=admin \
  --set auth.rootPassword=CHANGE_ME \
  --set auth.database=flow-watch
```

Create the app secrets expected by the charts:

```sh
kubectl create secret generic mongo-credentials \
  -n flow-watch \
  --from-literal=username=admin \
  --from-literal=password=CHANGE_ME

kubectl create secret generic openai-api-key \
  -n flow-watch \
  --from-literal=api-key=YOUR_OPENAI_API_KEY
```

## 5. Review The Example Values Files

Update these files before deploying:

- [deploy/linode/ui-values.yaml](deploy/linode/ui-values.yaml)
- [deploy/linode/service-values.yaml](deploy/linode/service-values.yaml)
- [deploy/linode/batch-values.yaml](deploy/linode/batch-values.yaml)

At minimum, replace:

- `YOUR_GITHUB_USERNAME`
- your UI and API hostnames
- `flow-watch-mongodb.flow-watch.svc.cluster.local` if your MongoDB service name differs
- any secret names if you choose different ones

If your images are public, leave `imagePullSecrets: []`.

If your images are private, create a GHCR pull secret and set:

```yaml
imagePullSecrets:
  - name: ghcr-regcred
```

## 6. Deploy With Helm Directly

Deploy the API first, then the UI, then the batch jobs:

```sh
helm upgrade --install flow-watch-service ./service/chart \
  --namespace flow-watch \
  -f deploy/linode/service-values.yaml

helm upgrade --install flow-watch-ui ./UI/chart \
  --namespace flow-watch \
  -f deploy/linode/ui-values.yaml

helm upgrade --install flow-watch-batch ./batch/chart \
  --namespace flow-watch \
  -f deploy/linode/batch-values.yaml
```

If you want to pin the deployment to the exact image SHA produced by GitHub Actions:

```sh
helm upgrade --install flow-watch-service ./service/chart \
  --namespace flow-watch \
  -f deploy/linode/service-values.yaml \
  --set image.tag=GIT_SHA

helm upgrade --install flow-watch-ui ./UI/chart \
  --namespace flow-watch \
  -f deploy/linode/ui-values.yaml \
  --set image.tag=GIT_SHA

helm upgrade --install flow-watch-batch ./batch/chart \
  --namespace flow-watch \
  -f deploy/linode/batch-values.yaml \
  --set image.tag=GIT_SHA
```

## 7. Verify The Deployment

```sh
kubectl get pods -n flow-watch
kubectl get ingress -n flow-watch
kubectl get cronjobs -n flow-watch
kubectl logs deploy/schedule-service -n flow-watch
```

If the service cannot connect to MongoDB, verify the MongoDB service DNS:

```sh
kubectl get svc -n flow-watch
```

Then update `env.MONGO_HOST` in the service and batch values files to match.