# Configuration

All configuration is via environment variables, validated at startup using Zod.

**Code anchor:** `src/config.ts`

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GRAFANA_CLOUD_PROMETHEUS_URL` | Prometheus/Mimir endpoint | `https://prometheus-prod-56-prod-us-east-2.grafana.net` |
| `GRAFANA_CLOUD_PROMETHEUS_ORG_ID` | Prometheus org ID (username) | `2668285` |
| `GRAFANA_CLOUD_LOKI_URL` | Loki endpoint | `https://logs-prod-036.grafana.net` |
| `GRAFANA_CLOUD_LOKI_ORG_ID` | Loki org ID | `1329819` |
| `GRAFANA_CLOUD_TEMPO_URL` | Tempo endpoint | `https://tempo-prod-26-prod-us-east-2.grafana.net` |
| `GRAFANA_CLOUD_TEMPO_ORG_ID` | Tempo org ID | `1324130` |
| `GRAFANA_CLOUD_OTLP_URL` | OTLP Gateway endpoint | `https://otlp-gateway-prod-us-east-2.grafana.net` |
| `GRAFANA_CLOUD_OTLP_ORG_ID` | OTLP org ID | `1372025` |
| `GRAFANA_CLOUD_ACCESS_TOKEN` | Grafana Cloud API token | `glc_eyJ...` |

## Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8085` |
| `GRAFANA_CLOUD_PROMETHEUS_TENANT_ID` | Override X-Scope-OrgID | Same as org ID |
| `GRAFANA_CLOUD_LOKI_TENANT_ID` | Override X-Scope-OrgID | Same as org ID |
| `GRAFANA_CLOUD_TEMPO_TENANT_ID` | Override X-Scope-OrgID | Same as org ID |
| `GRAFANA_CLOUD_OTLP_TENANT_ID` | Override X-Scope-OrgID | Same as org ID |

## Grafana Cloud Endpoints

Current production endpoints (as of January 2025):

| Service | URL | Org ID |
|---------|-----|--------|
| Prometheus | `prometheus-prod-56-prod-us-east-2.grafana.net` | 2668285 |
| Loki | `logs-prod-036.grafana.net` | 1329819 |
| Tempo | `tempo-prod-26-prod-us-east-2.grafana.net` | 1324130 |
| OTLP | `otlp-gateway-prod-us-east-2.grafana.net` | 1372025 |

To find your endpoints, log into Grafana Cloud and check the datasource configuration.

## Local Development (.env)

Copy `.env.example` to `.env` and fill in values:

```bash
GRAFANA_CLOUD_PROMETHEUS_URL=https://prometheus-prod-56-prod-us-east-2.grafana.net
GRAFANA_CLOUD_PROMETHEUS_ORG_ID=2668285
GRAFANA_CLOUD_PROMETHEUS_TENANT_ID=

GRAFANA_CLOUD_LOKI_URL=https://logs-prod-036.grafana.net
GRAFANA_CLOUD_LOKI_ORG_ID=1329819
GRAFANA_CLOUD_LOKI_TENANT_ID=

GRAFANA_CLOUD_TEMPO_URL=https://tempo-prod-26-prod-us-east-2.grafana.net
GRAFANA_CLOUD_TEMPO_ORG_ID=1324130
GRAFANA_CLOUD_TEMPO_TENANT_ID=

GRAFANA_CLOUD_OTLP_URL=https://otlp-gateway-prod-us-east-2.grafana.net
GRAFANA_CLOUD_OTLP_ORG_ID=1372025
GRAFANA_CLOUD_OTLP_TENANT_ID=

GRAFANA_CLOUD_ACCESS_TOKEN=your_token_here

PORT=8085
```

## Kubernetes (Helm Values)

Base configuration in `deployment/grafana-lgmt-proxy/values.yaml`:

```yaml
deployment:
  globalEnvs:
    - name: PORT
      value: "8085"
    - name: GRAFANA_CLOUD_PROMETHEUS_URL
      value: "https://prometheus-prod-56-prod-us-east-2.grafana.net"
    # ... other env vars
```

Environment-specific overrides in `values-{dev,stage,prod}.yaml`.

## Secrets Management

In production, sensitive values are encrypted using secrets-manager-go.

### How It Works

1. Sensitive values stored as `encrypted_*` in Helm values
2. At pod startup, secrets-manager-go decrypts using KMS
3. Decrypted values exported as environment variables
4. Application starts with plain-text env vars in memory

### Helm Values Structure

```yaml
# values-dev.yaml
encryptionKeys:
  dev: "7bc076713f0796718bb5954b61b76cfc3336bd98ea0f380b492fc5a99b633e30"

encryptedValues:
  encrypted_GRAFANA_CLOUD_ACCESS_TOKEN: "encrypted_AAAA..."
```

### Encrypting New Secrets

```bash
# Download public key for environment
aws kms get-public-key \
  --key-id alias/cmk-grafana-lgmt-proxy-secrets-manager \
  --query PublicKey --output text | base64 --decode > dev.pem

# Encrypt value
echo -n "glc_eyJ..." | secrets-manager-go encrypt --public-key dev.pem

# Add to values-dev.yaml under encryptedValues
```

## Validation

Configuration is validated at startup using Zod schemas.

**Code anchor:** `src/config.ts:4-19`

```typescript
const upstreamSchema = z.object({
  url: z.string().url(),
  orgId: z.string().min(1),
  tenantId: z.string().optional(),
})

const configSchema = z.object({
  upstreams: z.object({
    prometheus: upstreamSchema,
    loki: upstreamSchema,
    tempo: upstreamSchema,
    otlp: upstreamSchema,
  }),
  accessToken: z.string().min(1),
  port: z.number().int().positive().default(8085),
})
```

If validation fails, the application exits with an error message indicating which variable is missing or invalid.

## Production Expectations

| Setting | Value | Rationale |
|---------|-------|-----------|
| Replicas | 2+ | High availability |
| CPU request | 250m | Baseline for proxy workload |
| Memory request | 256Mi | Node.js baseline |
| CPU limit | 1000m | Allow burst for concurrent requests |
| Memory limit | 512Mi | Prevent memory leaks affecting node |

## Feature Flags

Currently no feature flags. All functionality is enabled by default.
