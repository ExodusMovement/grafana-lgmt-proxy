# Claude Code Instructions

## Project Overview
Lightweight reverse proxy for Grafana Cloud LGTM stack (Logs, Grafana, Metrics, Traces) with AWS Secrets Manager integration via Exodus's `secrets-manager-go-v2`.

**Read `PRD.md` first** - it contains full context, architecture, and implementation details.

## Key Concepts

### What This Does
- Intercepts requests to Grafana Cloud endpoints
- Injects authentication headers (Basic Auth + X-Scope-OrgID)
- Fetches credentials from AWS Secrets Manager/KMS at runtime
- Replaces need for `grafana-cloud-trial` Kubernetes secret

### secrets-manager-go-v2
Exodus tool for hybrid encryption (RSA + AES):
- Secrets encrypted with per-environment RSA public keys (from KMS CMK)
- Stored in Helm values as `encrypted_*` values
- Decrypted at runtime by init container using KMS
- **Always use v2 tag** in Dockerfile

### Grafana Cloud Endpoints
| Service | Endpoint | Org ID Key |
|---------|----------|------------|
| Prometheus | prometheus-prod-56-prod-us-east-2.grafana.net | prom-username: 2668285 |
| Loki | logs-prod-031.grafana.net | (same) |
| Tempo | tempo-prod-31-prod-us-east-2.grafana.net | tempo-username: 1324130 |
| OTLP | otlp-gateway-prod-us-east-2.grafana.net | otlp-username: 1372025 |

## Working on This Project

### Always Use Agents for Exploration
```
# Before making changes, explore first
Task(subagent_type="Explore", prompt="Understand the current nginx config structure")
Task(subagent_type="Plan", prompt="Design the helm chart structure for this proxy")
```

### Implementation Priority
1. **Phase 1**: Basic nginx proxy with hardcoded auth (proof of concept)
2. **Phase 2**: secrets-manager-go integration (init container pattern)
3. **Phase 3**: Helm chart with encrypted values

### Key Files
- `PRD.md` - Full requirements and architecture
- `Dockerfile` - Must copy secrets-manager-go from v2 tag
- `entrypoint.sh` - Decrypts secrets, renders nginx config, starts nginx
- `nginx.conf.template` - Uses envsubst placeholders
- `deployment/grafana-lgmt-proxy/` - Helm chart

### Terraform Setup Required
Before deploying, need:
1. CMK in each environment (dev/stage/prod)
2. IRSA policy with kms:Decrypt permission
3. Public keys downloaded and fingerprints generated

See `PRD.md` for detailed terraform examples.

## Commands

### Local Development
```bash
# Build and test
docker build -t grafana-lgmt-proxy .
docker run -p 8085:8085 grafana-lgmt-proxy

# Test proxy (without auth for local testing)
curl http://localhost:8085/health
```

### Helm
```bash
# Template check
helm template grafana-lgmt-proxy ./deployment/grafana-lgmt-proxy -f values-dev.yaml

# Install
helm upgrade --install grafana-lgmt-proxy ./deployment/grafana-lgmt-proxy \
  -n observability \
  -f values-dev.yaml
```

### Secrets Validation
```bash
# Validate encrypted values match expected key
secrets-manager-go validate --file deployment/grafana-lgmt-proxy/values-dev.yaml
```

## Commit Conventions
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (deps, build)
- `docs`: Documentation

## Security Rules
- Never commit plaintext secrets
- Always use encrypted values in values-*.yaml
- Delete temporary .env files after encryption
- Use IRSA, not long-lived credentials
