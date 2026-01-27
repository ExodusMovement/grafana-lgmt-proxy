# Grafana LGMT Proxy - Product Requirements Document

## Overview

A lightweight reverse proxy for Grafana Cloud's LGTM stack (Logs, Grafana, Metrics, Traces) that:
- Intercepts requests to Grafana Cloud endpoints
- Injects authentication credentials from AWS Secrets Manager
- Eliminates the need for Kubernetes secrets containing Grafana Cloud tokens
- Uses Exodus's `secrets-manager-go-v2` for secure credential management

## Problem Statement

Current state:
- Grafana Cloud credentials stored in Kubernetes Secret (`grafana-cloud-trial` in `observability` namespace)
- Each service needing Grafana Cloud access must either:
  - Have the secret copied to its namespace
  - Use complex cross-namespace secret references
- Credentials are static and require manual rotation

Desired state:
- Centralized proxy handles all Grafana Cloud authentication
- Credentials fetched from AWS Secrets Manager at runtime
- Integrated with Exodus's KMS-based encryption workflow
- Single deployment, multiple consumers

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                                      │
│                                                                          │
│  ┌──────────────┐     ┌──────────────────────────────────────────────┐ │
│  │ kubecost     │────▶│                                              │ │
│  └──────────────┘     │                                              │ │
│                       │  grafana-lgmt-proxy                          │ │
│  ┌──────────────┐     │  ┌────────────────────────────────────────┐ │ │
│  │ alloy        │────▶│  │ Init: secrets-manager-go decrypt       │ │ │
│  └──────────────┘     │  │       ↓                                 │ │ │
│                       │  │ nginx/envoy: add auth headers           │ │ │
│  ┌──────────────┐     │  │       ↓                                 │ │ │
│  │ other svc    │────▶│  │ Forward to Grafana Cloud                │ │ │
│  └──────────────┘     │  └────────────────────────────────────────┘ │ │
│                       │                                              │ │
│                       └──────────────────┬───────────────────────────┘ │
│                                          │                              │
└──────────────────────────────────────────┼──────────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │ AWS Secrets Manager    │
                              │ + KMS Decryption       │
                              └────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │ Grafana Cloud          │
                              │ prometheus-prod-56...  │
                              └────────────────────────┘
```

## Grafana Cloud Endpoints

The proxy should support all LGTM endpoints:

| Service | Endpoint | Auth Header |
|---------|----------|-------------|
| Prometheus (Metrics) | `https://prometheus-prod-56-prod-us-east-2.grafana.net/` | `X-Scope-OrgID: {org_id}`, `Authorization: Basic {user:token}` |
| Loki (Logs) | `https://logs-prod-031.grafana.net/` | Same |
| Tempo (Traces) | `https://tempo-prod-31-prod-us-east-2.grafana.net/` | Same |
| OTLP (OpenTelemetry) | `https://otlp-gateway-prod-us-east-2.grafana.net/` | `Authorization: Basic {user:token}` |

Current credentials (from `grafana-cloud-trial` secret):
- `prom-username`: 2668285 (Prometheus/Mimir)
- `tempo-username`: 1324130
- `otlp-username`: 1372025
- `access-token`: Grafana Cloud API token

## Implementation Requirements

### Phase 1: Basic Proxy
- [ ] Nginx-based proxy with configurable backends
- [ ] Support for multiple Grafana Cloud endpoints (prometheus, loki, tempo, otlp)
- [ ] Health check endpoint
- [ ] Prometheus metrics for proxy itself

### Phase 2: secrets-manager-go Integration
- [ ] Init container runs `secrets-manager-go` to decrypt credentials
- [ ] Credentials injected as environment variables
- [ ] nginx config rendered with envsubst or similar
- [ ] IRSA configured for KMS decrypt permissions

### Phase 3: Helm Chart
- [ ] Configurable endpoints
- [ ] Per-environment encrypted values
- [ ] CMK fingerprint validation
- [ ] Service mesh compatible (optional mTLS)

## Secrets Manager V2 Integration

### Overview
Exodus uses `secrets-manager-go-v2` for hybrid encryption (RSA + AES) of secrets. Secrets are:
1. Encrypted with environment-specific RSA public keys (from KMS CMK)
2. Stored in Helm values files as `encrypted_*` values
3. Decrypted at runtime using KMS

### Required Setup

#### 1. Create CMK (Customer Master Key)
Each environment needs its own asymmetric RSA_4096 CMK via Terraform:

```hcl
# Example: infra-live/dev/us-east-1/dev/security/kms-master-key/grafana-lgmt-proxy-secrets-manager/terragrunt.hcl
inputs = {
  key_name = "cmk-grafana-lgmt-proxy-secrets-manager"

  cmk_administrator_iam_arns = [
    "arn:aws:iam::483945769383:root",  # Dev account
    "arn:aws:iam::618446832707:user/jstaker",
    "arn:aws:iam::316676488525:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_full-access-from-other-accounts_78b8a9b6a02e8967"
  ]

  cmk_user_iam_arns = [
    {
      name = [
        "arn:aws:iam::483945769383:root",
        "arn:aws:iam::618446832707:user/jstaker",
        "arn:aws:iam::316676488525:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_full-access-from-other-accounts_78b8a9b6a02e8967"
      ]
      conditions = [
        {
          test     = "StringEquals"
          variable = "kms:CallerAccount"
          values   = ["483945769383", "618446832707", "316676488525"]
        }
      ]
    }
  ]

  allow_manage_key_permissions_with_iam = false
  default_deletion_window_in_days       = 7
  customer_master_key_spec              = "RSA_4096"
}
```

Account IDs:
- Dev: 483945769383
- Stage: 966685100113 (verify)
- Prod: (get from infra-live)

#### 2. Download Public Keys
```bash
# For each environment
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey \
  --output text \
  | base64 --decode \
  | openssl pkey -pubin -inform DER -out dev.pem
```

#### 3. Configure IRSA (IAM Roles for Service Accounts)
Add KMS decrypt permission to the service account:

```json
{
  "Sid": "AllowKMSDecrypt",
  "Effect": "Allow",
  "Action": ["kms:Decrypt"],
  "Resource": ["arn:aws:kms:us-east-1:483945769383:key/<key-id>"]
}
```

Reference: `infra-live/dev/us-east-1/dev/security/irsa/grafana-lgmt-proxy/policy/grafana-lgmt-proxy.json`

#### 4. Generate Key Fingerprints
```bash
secrets-manager-go fingerprint --public-key dev.pem
# Output: 7bc076713f0796718bb5954b61b76cfc3336bd98ea0f380b492fc5a99b633e30
```

#### 5. Encrypt Secrets
```bash
# Create env file with secrets (delete after!)
cat > grafana-cloud.env << 'EOF'
GRAFANA_CLOUD_PROM_USERNAME=2668285
GRAFANA_CLOUD_TEMPO_USERNAME=1324130
GRAFANA_CLOUD_OTLP_USERNAME=1372025
GRAFANA_CLOUD_ACCESS_TOKEN=glc_eyJv...
EOF

# Encrypt for dev
secrets-manager-go encrypt --public-key dev.pem --file grafana-cloud.env --kv

# Delete the plaintext file!
rm grafana-cloud.env
```

#### 6. Helm Values Structure
```yaml
# values.yaml (base)
encryptionKeys:
  dev: "7bc076713f0796718bb5954b61b76cfc3336bd98ea0f380b492fc5a99b633e30"
  stage: "ed4c3ea376b6f19c8935b392fc4eec527c11151b8d11468d6a2f7f77ff2d3b03"
  prod: "b272a6ee0fa9b449945bb724e674f13e8ae6ef14bc9965f56867257a8cdc776c"

# values-dev.yaml
encryptedValues:
  GRAFANA_CLOUD_PROM_USERNAME: encrypted_AAAAywgBEOugxsIGGh...
  GRAFANA_CLOUD_TEMPO_USERNAME: encrypted_BBBBxwgCEPvhxsIGGh...
  GRAFANA_CLOUD_OTLP_USERNAME: encrypted_CCCCywgDEQwhxsIGGh...
  GRAFANA_CLOUD_ACCESS_TOKEN: encrypted_DDDDywgEERwhxsIGGh...
```

### Validation in CI
```yaml
- name: Validate secrets
  run: |
    secrets-manager-go validate --file values-dev.yaml
    secrets-manager-go validate --file values-stage.yaml
    secrets-manager-go validate --file values-prod.yaml
```

## Deployment Pattern

### Dockerfile
```dockerfile
FROM nginx:1.25-alpine

# Copy secrets-manager-go binary (use v2 tag!)
COPY --from=ghcr.io/exodusmovement/secrets-manager-go:v2 /secrets-manager-go /usr/local/bin/

# Copy nginx config template
COPY nginx.conf.template /etc/nginx/templates/

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### Entrypoint
```bash
#!/bin/sh
set -e

# Decrypt secrets and inject as env vars
eval $(secrets-manager-go --kms-key alias/cmk-grafana-lgmt-proxy-secrets-manager -- env | grep GRAFANA_CLOUD)

# Generate nginx config from template
envsubst '${GRAFANA_CLOUD_PROM_USERNAME} ${GRAFANA_CLOUD_ACCESS_TOKEN}' \
  < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
```

## Project Structure

```
grafana-lgmt-proxy/
├── PRD.md                    # This file
├── CLAUDE.md                 # Claude Code instructions
├── Dockerfile
├── entrypoint.sh
├── nginx.conf.template
├── deployment/
│   └── grafana-lgmt-proxy/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-stage.yaml
│       ├── values-prod.yaml
│       └── templates/
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── configmap.yaml
│           └── serviceaccount.yaml
└── terraform/
    └── examples/
        ├── cmk/              # CMK terraform example
        └── irsa/             # IRSA policy example
```

## Success Criteria

1. **Functional**: Proxy successfully forwards requests to Grafana Cloud with proper auth
2. **Secure**: No plaintext secrets in K8s, all credentials from AWS Secrets Manager
3. **Observable**: Prometheus metrics exposed, health checks work
4. **Portable**: Helm chart deployable to any environment
5. **Validated**: CI validates encrypted secrets before deployment

## References

- [secrets-manager-go repo](https://github.com/ExodusMovement/secrets-manager-go)
- [CMK Terraform example](https://github.com/ExodusMovement/infra-live/blob/tf1.9/dev/us-east-1/dev/security/kms-master-key/exchange-secrets-manager/terragrunt.hcl)
- [IRSA policy example](https://github.com/ExodusMovement/infra-live/blob/tf1.9/dev/us-east-1/dev/security/irsa/exchange-server/policy/exchange-server-backend.json)
- Grafana Cloud Stack: exodusmovement.grafana.net

## Notes for Claude Code Sessions

When working on this project:

1. **Use agents for exploration**: Spawn `Explore` agents to understand codebase structure before making changes
2. **Use `Plan` agent**: For complex implementation decisions, use planning agent first
3. **Reference this PRD**: This document contains all context needed after compaction
4. **Secrets are sensitive**: Never commit plaintext secrets, always use encrypted values
5. **Test locally first**: Use docker-compose or kind cluster before deploying to real clusters
6. **Follow commit conventions**: Use semantic commits (feat, fix, chore, etc.)

### Quick Context Recovery Commands
```bash
# Check current Grafana Cloud config
kubectl get secret grafana-cloud-trial -n observability -o yaml

# Test proxy locally
docker build -t grafana-lgmt-proxy .
docker run -p 8085:8085 grafana-lgmt-proxy

# Validate helm chart
helm template ./deployment/grafana-lgmt-proxy -f values-dev.yaml
```
