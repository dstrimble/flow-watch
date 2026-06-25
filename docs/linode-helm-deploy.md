# Flow Watch On Personal GitHub And Linode

This repo is set up for a personal GitHub repository plus direct Helm-based deployment to Linode Kubernetes.

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

## 2. Build And Publish Images Manually

Build and push the images from your machine to your Docker Hub account:

- `docker.io/dstrimble83/flow-watch-ui`
- `docker.io/dstrimble83/flow-watch-service`
- `docker.io/dstrimble83/flow-watch-batch`

You can also build and push manually:

```sh
docker login
docker build -t docker.io/dstrimble83/flow-watch-ui:latest ./UI
docker build -t docker.io/dstrimble83/flow-watch-service:latest ./service
docker build -t docker.io/dstrimble83/flow-watch-batch:latest ./batch
docker push docker.io/dstrimble83/flow-watch-ui:latest
docker push docker.io/dstrimble83/flow-watch-service:latest
docker push docker.io/dstrimble83/flow-watch-batch:latest
```

If your Docker Hub repositories stay private, create an image pull secret in the cluster and set `imagePullSecrets` in the values files.

## 3. Prepare Your Linode Cluster

Use your Linode kubeconfig locally, then create the target namespace:

```sh
kubectl config current-context
kubectl create namespace flow-watch
```

Create a Cloudflare Tunnel in your Cloudflare account and copy the tunnel token.

Add the tunnel token as a Kubernetes secret:

```sh
kubectl create secret generic cloudflare-tunnel-token \
  -n flow-watch \
  --from-literal=token=YOUR_CLOUDFLARE_TUNNEL_TOKEN
```

Configure the tunnel to route your public hostnames to the internal services:

- `flow-watch.example.com` -> `http://flow-watch-ui.flow-watch.svc.cluster.local:80`
- `api.flow-watch.example.com` -> `http://schedule-service.flow-watch.svc.cluster.local:3000`

You can set these hostnames in the Cloudflare Tunnel dashboard or in a tunnel config if you manage one locally.

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
```

If you enable OpenAI integration later, create a secret and set `secrets.openaiApiKeyName` in `deploy/linode/service-values.yaml`.

## 5. Review The Example Values Files

Update these files before deploying:

- [deploy/linode/ui-values.yaml](deploy/linode/ui-values.yaml)
- [deploy/linode/service-values.yaml](deploy/linode/service-values.yaml)
- [deploy/linode/batch-values.yaml](deploy/linode/batch-values.yaml)

At minimum, replace:

- your UI and API hostnames
- `flow-watch-mongodb.flow-watch.svc.cluster.local` if your MongoDB service name differs
- any secret names if you choose different ones

If your images are public, leave `imagePullSecrets: []`.

If your images are private, create a Docker Hub pull secret and set:

```yaml
imagePullSecrets:
  - name: dockerhub-regcred
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

Deploy the Cloudflare Tunnel last:

```sh
helm upgrade --install cloudflared ./cloudflared/chart \
  --namespace flow-watch \
  --set tunnelTokenSecretName=cloudflare-tunnel-token
```

If you want to pin the deployment to an exact image SHA you pushed manually:

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
kubectl get cronjobs -n flow-watch
kubectl logs deploy/schedule-service -n flow-watch
kubectl logs deploy/cloudflared -n flow-watch
```

If the service cannot connect to MongoDB, verify the MongoDB service DNS:

```sh
kubectl get svc -n flow-watch
```

Then update `env.MONGO_HOST` in the service and batch values files to match.