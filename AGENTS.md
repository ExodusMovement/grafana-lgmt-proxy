# Grafana LGMT Proxy

Lightweight reverse proxy for Grafana Cloud LGTM stack with AWS Secrets Manager integration.

## Quick Context

**Purpose**: Intercept requests to Grafana Cloud, inject auth credentials from AWS Secrets Manager (via `secrets-manager-go-v2`), eliminate `grafana-cloud-trial` K8s secret.

**Read `PRD.md`** for full architecture, secrets-manager-go setup, and implementation details.

## Implementation Phases

### Phase 1: Basic Proxy (Start Here)
Create working nginx proxy with configurable backends:
- `Dockerfile` - nginx:1.25-alpine base
- `nginx.conf.template` - envsubst placeholders for credentials
- `entrypoint.sh` - render config, start nginx
- `docker-compose.yaml` - local testing

### Phase 2: secrets-manager-go Integration
Add init container pattern:
- Copy `secrets-manager-go` binary (v2 tag)
- Decrypt `encrypted_*` env vars using KMS
- Inject credentials into nginx config

### Phase 3: Helm Chart
Production deployment:
- `deployment/grafana-lgmt-proxy/` chart structure
- `encryptionKeys` and `encryptedValues` blocks
- IRSA ServiceAccount for KMS decrypt
- Multi-environment support (dev/stage/prod)

## Grafana Cloud Endpoints

| Service | Endpoint | Org ID |
|---------|----------|--------|
| Prometheus | prometheus-prod-56-prod-us-east-2.grafana.net | 2668285 |
| Loki | logs-prod-031.grafana.net | 2668285 |
| Tempo | tempo-prod-31-prod-us-east-2.grafana.net | 1324130 |
| OTLP | otlp-gateway-prod-us-east-2.grafana.net | 1372025 |

Auth: `Authorization: Basic base64(org_id:access_token)` + `X-Scope-OrgID: org_id`

## Working Guidelines

### Use Agents
- **Explore agent**: Before changes, understand existing code
- **Plan agent**: For architectural decisions
- **Task agent**: For parallel independent work

### File Structure Target
```
grafana-lgmt-proxy/
├── AGENTS.md
├── PRD.md
├── Dockerfile
├── entrypoint.sh
├── nginx.conf.template
├── docker-compose.yaml
└── deployment/
    └── grafana-lgmt-proxy/
        ├── Chart.yaml
        ├── values.yaml
        ├── values-{dev,stage,prod}.yaml
        └── templates/
```

### Commit Conventions
`feat`, `fix`, `chore`, `docs` - semantic commits

### Security
- Never commit plaintext secrets
- Use `encrypted_*` values in Helm
- IRSA for KMS access, no long-lived creds

## Implementation Prompts

Copy-paste these to start each phase:

### Phase 1 Prompt:
```
Implement Phase 1 of grafana-lgmt-proxy: Create a basic nginx reverse proxy.

Requirements:
1. Accepts requests on port 8085
2. Forwards to Grafana Cloud Prometheus endpoint
3. Injects X-Scope-OrgID and Authorization headers
4. Uses envsubst for credential placeholders
5. Health check endpoint at /health

Create these files:
- Dockerfile (nginx:1.25-alpine)
- nginx.conf.template (with ${VAR} placeholders)
- entrypoint.sh (envsubst + exec nginx)
- docker-compose.yaml (for local testing with env vars)

Read PRD.md for endpoint details and auth header format.
```

### Phase 2 Prompt:
```
Implement Phase 2: Add secrets-manager-go integration.

Requirements:
1. Update Dockerfile to copy secrets-manager-go binary
   FROM ghcr.io/exodusmovement/secrets-manager-go:v2 as secrets-manager
2. Update entrypoint.sh to decrypt encrypted_* env vars using --kms-key
3. Support multiple Grafana Cloud endpoints (prometheus, loki, tempo, otlp)
4. Route based on URL path prefix

Read PRD.md for secrets-manager-go usage patterns and entrypoint example.
```

### Phase 3 Prompt:
```
Implement Phase 3: Create Helm chart in deployment/grafana-lgmt-proxy/

Requirements:
1. Chart.yaml with proper metadata
2. values.yaml with grafanaCloud config block
3. Deployment with init container for secrets decryption
4. ServiceAccount with IRSA annotations placeholder
5. ConfigMap for nginx template
6. Service exposing port 8085
7. values-dev.yaml with encryptionKeys and encryptedValues blocks

Read PRD.md for Helm structure, IRSA setup, and encryption patterns.
```

## Commands

```bash
# Build and test locally
docker build -t grafana-lgmt-proxy .
docker-compose up

# Test health
curl http://localhost:8085/health

# Helm template check
helm template grafana-lgmt-proxy ./deployment/grafana-lgmt-proxy

# Validate secrets
secrets-manager-go validate --file deployment/grafana-lgmt-proxy/values-dev.yaml
```
