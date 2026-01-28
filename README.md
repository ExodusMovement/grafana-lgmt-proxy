# Grafana LGMT Proxy

Lightweight reverse proxy for Grafana Cloud LGTM stack (Logs, Grafana, Traces, Metrics) with AWS Secrets Manager integration.

## Overview

Intercepts requests to Grafana Cloud endpoints and injects authentication credentials from AWS Secrets Manager using `secrets-manager-go-v2`.

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ kubecost/alloy  │────▶│ grafana-lgmt-proxy  │────▶│ Grafana Cloud   │
│ other services  │     │ + auth injection    │     │ prometheus/loki │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │ AWS Secrets Mgr │
                        │ + KMS Decrypt   │
                        └─────────────────┘
```

## Supported Endpoints

| Prefix | Upstream | Description |
|--------|----------|-------------|
| `/api/prom/*` | Prometheus | Metrics push |
| `/prometheus/*` | Prometheus | Query API |
| `/loki/*` | Loki | Logs |
| `/tempo/*` | Tempo | Traces |
| `/otlp/*` | OTLP Gateway | OpenTelemetry |

## Quick Start

### Local Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run locally
cp .env.example .env
# Edit .env with your credentials
pnpm dev
```

### Docker Build

```bash
# Login to ECR (requires AWS credentials)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 534042329084.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t grafana-lgmt-proxy:test \
  --build-arg DEPLOYMENT_ID=local \
  --build-arg GIT_COMMIT_SHA=local .

# Run with docker-compose
docker-compose up
```

### Test Endpoints

```bash
curl http://localhost:8085/health
curl http://localhost:8085/ready
curl http://localhost:8085/metrics
```

## Configuration

Environment variables:

| Variable | Description |
|----------|-------------|
| `GRAFANA_CLOUD_PROMETHEUS_URL` | Prometheus endpoint URL |
| `GRAFANA_CLOUD_PROMETHEUS_ORG_ID` | Prometheus org ID |
| `GRAFANA_CLOUD_LOKI_URL` | Loki endpoint URL |
| `GRAFANA_CLOUD_LOKI_ORG_ID` | Loki org ID |
| `GRAFANA_CLOUD_TEMPO_URL` | Tempo endpoint URL |
| `GRAFANA_CLOUD_TEMPO_ORG_ID` | Tempo org ID |
| `GRAFANA_CLOUD_OTLP_URL` | OTLP Gateway URL |
| `GRAFANA_CLOUD_OTLP_ORG_ID` | OTLP org ID |
| `GRAFANA_CLOUD_ACCESS_TOKEN` | Grafana Cloud API token |
| `PORT` | Server port (default: 8085) |

## Deployment

### Helm

```bash
helm template grafana-lgmt-proxy ./deployment/grafana-lgmt-proxy \
  -f ./deployment/grafana-lgmt-proxy/values-dev.yaml
```

### CI/CD

- **GitHub Actions**: Docker build to ECR
- **GitLab CI**: Multi-arch build and deployment

## Project Structure

```
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # Fastify server setup
│   ├── config.ts         # Configuration loading
│   ├── types.ts          # TypeScript types
│   └── routes/
│       ├── health.ts     # Health endpoints
│       ├── metrics.ts    # Prometheus metrics
│       └── proxy.ts      # Proxy routes
├── deployment/
│   └── grafana-lgmt-proxy/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── values-{dev,stage,prod}.yaml
├── Dockerfile
├── entrypoint.sh
└── docker-compose.yaml
```

## Documentation

- [PRD.md](./PRD.md) - Product requirements and architecture details
- [CLAUDE.md](./CLAUDE.md) - Development instructions
