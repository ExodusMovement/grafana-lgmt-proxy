# Grafana LGMT Proxy Documentation

Lightweight reverse proxy for Grafana Cloud LGTM stack (Logs, Grafana, Traces, Metrics) with AWS Secrets Manager integration.

## Quick Navigation

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Prerequisites, local dev, first success checklist |
| [Architecture](architecture.md) | C4 diagrams, component overview, request flows |
| [Configuration](configuration.md) | Environment variables, defaults, secrets |
| [API Reference](api.md) | Proxy endpoints, path mappings, examples |
| [Operations](operations.md) | Health checks, metrics, troubleshooting |
| [Security](security.md) | Auth model, secrets management, IRSA |

## If You Only Read Three Docs

1. **[Getting Started](getting-started.md)** - Get the proxy running locally in 5 minutes
2. **[API Reference](api.md)** - Understand which endpoints to use for your service
3. **[Configuration](configuration.md)** - Set up the correct Grafana Cloud URLs and credentials

## What This Proxy Does

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

The proxy:
1. Accepts requests from internal services (kubecost, observability-agents)
2. Injects Grafana Cloud authentication headers (Basic Auth + X-Scope-OrgID)
3. Forwards requests to the appropriate Grafana Cloud endpoint
4. Returns responses transparently

## Legacy Documentation

Historical planning documents are in [legacy/](legacy/README.md). Use this documentation for current reference.
