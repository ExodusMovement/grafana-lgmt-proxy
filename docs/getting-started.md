# Getting Started

Get grafana-lgmt-proxy running locally in under 5 minutes.

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Docker | Latest | `docker --version` |
| AWS CLI | 2.x | `aws --version` |

## Quick Start (Local Development)

```bash
# Clone and install
git clone https://github.com/ExodusMovement/grafana-lgmt-proxy.git
cd grafana-lgmt-proxy
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Grafana Cloud credentials (see Configuration docs)

# Start development server
pnpm dev
```

The server starts on `http://localhost:8085`.

## First Success Checklist

After starting the server, verify these endpoints return expected responses:

```bash
# 1. Health check - should return {"status":"ok"}
curl http://localhost:8085/health

# 2. Readiness check - should return {"status":"ok"}
curl http://localhost:8085/ready

# 3. Metrics endpoint - should return Prometheus metrics
curl http://localhost:8085/metrics
```

If you have valid Grafana Cloud credentials configured:

```bash
# 4. Query Prometheus - should return metrics data
curl 'http://localhost:8085/prometheus/api/v1/query?query=up'
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Docker Build

Requires AWS credentials for ECR access:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 534042329084.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t grafana-lgmt-proxy:test \
  --build-arg DEPLOYMENT_ID=local \
  --build-arg GIT_COMMIT_SHA=local .

# Run container
docker run -p 8085:8085 --env-file .env grafana-lgmt-proxy:test
```

## Common Pitfalls

### "Missing required environment variable"

All `GRAFANA_CLOUD_*` variables are required. Check your `.env` file has all variables from `.env.example`.

**Code anchor:** `src/config.ts:21-27` - `getEnvOrThrow()` throws if env var is missing.

### "ECR login failed"

You need AWS credentials with ECR read access. Run:
```bash
aws sts get-caller-identity  # Verify you're authenticated
```

### "Cannot connect to Grafana Cloud"

1. Verify URLs are correct (see [Configuration](configuration.md))
2. Verify access token has appropriate scopes
3. Check network connectivity to Grafana Cloud endpoints

### Tests fail with "EADDRINUSE"

Another process is using port 8085. Kill it or change the `PORT` env var:
```bash
lsof -i :8085  # Find the process
PORT=8086 pnpm dev  # Use different port
```

## Project Structure

```
src/
├── index.ts          # Entry point, server startup
├── server.ts         # Fastify server configuration
├── config.ts         # Environment config with Zod validation
├── types.ts          # TypeScript type definitions
└── routes/
    ├── health.ts     # /health, /ready endpoints
    ├── metrics.ts    # /metrics endpoint (prom-client)
    └── proxy.ts      # Proxy routes to Grafana Cloud
```

## Next Steps

- [Configuration](configuration.md) - Set up Grafana Cloud credentials
- [API Reference](api.md) - Learn which endpoints to use
- [Architecture](architecture.md) - Understand how the proxy works
