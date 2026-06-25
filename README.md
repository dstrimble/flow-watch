# flow-watch

This project provides three main components:

- **batch**: Scrapes the SWPA water release schedule and inserts it into MongoDB.
- **service**: Provides an API to access the schedule data from MongoDB.
- **UI**: A React + Bootstrap web interface to view today's water release schedule.

## Quick Start: Local Development with Docker Compose

1. **Start all services with Docker Compose:**

```sh
docker compose up --build
```

This will start:
- `mongodb`: The database for storing schedule data.
- `scrape-scheduler`: The batch scraper that fetches and inserts schedule data into MongoDB.
- `schedule-service`: The API service for accessing schedule data.
- `UI`: The web interface for viewing the schedule.

2. **Access the API:**

The API will be available at:
- **Schedule for a specific dam and date:**
  [http://localhost:3000/schedule/BBD/YYYY-MM-DD](http://localhost:3000/schedule/BBD/YYYY-MM-DD)
- **Dam codes (metadata):**
  [http://localhost:3000/schedule/damcodes](http://localhost:3000/schedule/damcodes)
- **Current flow rates for all dams:**
  [http://localhost:3000/schedule/currentflow](http://localhost:3000/schedule/currentflow)

3. **Access the UI:**

The UI will be available at:
[http://localhost:8080](http://localhost:8080)

Authentication is handled via Keycloak. Users can:
- Register and login with Google ("Login with Google")
- Register and login with a local account (email + password)

Facebook login is not supported.

| Code    | Project                | State     |
|---------|------------------------|-----------|
| BBD     | Broken Bow             | Oklahoma  |
| DEN     | Denison                | Okla-Texas|
| KEY     | Keystone               | Oklahoma  |
| FGD     | Fort Gibson            | Oklahoma  |
| WFD     | Webbers Falls L&D      | Oklahoma  |
| TKD     | Tenkiller              | Oklahoma  |
| EUF     | Eufaula                | Oklahoma  |
| RSK     | Robert S. Kerr L&D     | Oklahoma  |
| OZD     | Ozark L&D              | Arkansas  |
| DAD     | Dardanelle L&D         | Arkansas  |
| BEV     | Beaver                 | Arkansas  |
| TRD     | Table Rock             | Missouri  |
| BSD     | Bull Shoals            | Arkansas  |
| NFD     | Norfork                | Arkansas  |
| GFD     | Greers Ferry           | Arkansas  |
| STD     | Stockton               | Missouri  |
| HST     | Harry S Truman         | Missouri  |
| CAN     | Clarence Cannon        | Missouri  |

## Environment Variables

The following environment variables are used by all components (see `compose.yaml`):

- `MONGO_HOST`: MongoDB host (default: `mongodb` in Docker Compose)
- `MONGO_PORT`: MongoDB port (default: `27017`)
- `MONGO_DB`: Database name (default: `flow-watch`)
- `MONGO_COLLECTION`: Collection name (default: `swpa_schedule`)
- `MONGO_USERNAME`: MongoDB username (default: `admin`)
- `MONGO_PASSWORD`: MongoDB password (default: `password`)
- `AUTH_SOURCE`: Authentication database (default: `admin`)
- `PORT`: API service port (default: `3000`)
- `CONTEXT_PATH`: API base path (default: `/schedule`)

## Project Structure

- `batch/`: Batch scraper code and Dockerfile
- `service/`: API service code and Dockerfile
- `UI/`: React web UI
- `compose.yaml`: Docker Compose configuration for local development
- `docker-entrypoint-initdb.d/`: Optional MongoDB initialization scripts
- `config/`: Dam codes config (used by service)

See the individual READMEs in each folder for more details and advanced usage.

## Personal GitHub + Linode Helm Deployment

This repo can be moved to a personal GitHub repository and deployed to Linode Kubernetes with direct Helm commands.

Use the end-to-end guide in [docs/linode-helm-deploy.md](docs/linode-helm-deploy.md).

Example Helm values files are included in:

- `deploy/linode/ui-values.yaml`
- `deploy/linode/service-values.yaml`
- `deploy/linode/batch-values.yaml`

