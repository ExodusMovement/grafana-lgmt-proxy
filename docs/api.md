# API Reference

The proxy exposes endpoints that mirror Grafana Cloud APIs with automatic authentication injection.

## Base URL

```
http://grafana-lgmt-proxy.observability:8085
```

In local development: `http://localhost:8085`

## Health Endpoints

### GET /health

Liveness probe endpoint.

**Response:**
```json
{"status": "ok"}
```

**Code anchor:** `src/routes/health.ts:4-6`

### GET /ready

Readiness probe endpoint.

**Response:**
```json
{"status": "ok"}
```

**Code anchor:** `src/routes/health.ts:8-10`

### GET /metrics

Prometheus metrics for the proxy itself.

**Response:** Prometheus text format
```
# HELP proxy_requests_total Total number of proxied requests
# TYPE proxy_requests_total counter
proxy_requests_total{upstream="prometheus",method="GET",status="200"} 42
...
```

**Code anchor:** `src/routes/metrics.ts`

## Proxy Endpoints

All proxy endpoints forward requests to Grafana Cloud with injected authentication headers.

### Prometheus Endpoints

#### POST /api/prom/push

Remote write endpoint for metrics.

**Use case:** observability-agents (Alloy) metrics push

**Upstream:** `https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/push`

**Example:**
```bash
curl -X POST http://localhost:8085/api/prom/push \
  -H "Content-Type: application/x-protobuf" \
  -H "Content-Encoding: snappy" \
  --data-binary @metrics.snappy
```

**Code anchor:** `src/routes/proxy.ts:64-70`

#### GET /prometheus/api/v1/query

Instant query endpoint.

**Use case:** kubecost, dashboards, ad-hoc queries

**Upstream:** Rewritten to `/api/prom/api/v1/query`

**Example:**
```bash
curl 'http://localhost:8085/prometheus/api/v1/query?query=up'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {"__name__": "up", "job": "prometheus"},
        "value": [1769561580, "1"]
      }
    ]
  }
}
```

**Code anchor:** `src/routes/proxy.ts:71-76`

#### GET /prometheus/api/v1/query_range

Range query endpoint.

**Example:**
```bash
curl 'http://localhost:8085/prometheus/api/v1/query_range?query=up&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z&step=60s'
```

#### GET /prometheus/api/v1/labels

List all label names.

**Example:**
```bash
curl 'http://localhost:8085/prometheus/api/v1/labels'
```

#### GET /prometheus/api/v1/label/{name}/values

List values for a label.

**Example:**
```bash
curl 'http://localhost:8085/prometheus/api/v1/label/job/values'
```

### Loki Endpoints

#### POST /loki/loki/api/v1/push

Log push endpoint.

**Upstream:** `https://logs-prod-036.grafana.net/loki/api/v1/push`

**Example:**
```bash
curl -X POST http://localhost:8085/loki/loki/api/v1/push \
  -H "Content-Type: application/json" \
  -d '{"streams":[{"stream":{"job":"test"},"values":[["1234567890000000000","log line"]]}]}'
```

**Code anchor:** `src/routes/proxy.ts:83-88`

#### GET /loki/api/v1/labels

List all label names.

**Example:**
```bash
curl 'http://localhost:8085/loki/api/v1/labels'
```

**Response:**
```json
{
  "status": "success",
  "data": ["job", "namespace", "pod", "container"]
}
```

#### GET /loki/api/v1/query_range

Query logs over a time range.

**Example:**
```bash
curl 'http://localhost:8085/loki/api/v1/query_range?query={job="test"}&start=1704067200&end=1704070800'
```

### Tempo Endpoints

#### GET /tempo/api/traces/{traceID}

Fetch a trace by ID.

**Upstream:** `https://tempo-prod-26-prod-us-east-2.grafana.net/tempo/api/traces/{traceID}`

**Example:**
```bash
curl 'http://localhost:8085/tempo/api/traces/1234567890abcdef'
```

**Code anchor:** `src/routes/proxy.ts:89-94`

#### GET /tempo/api/search

Search for traces.

**Example:**
```bash
curl 'http://localhost:8085/tempo/api/search?limit=10'
```

**Response:**
```json
{
  "traces": [
    {
      "traceID": "1234567890abcdef",
      "rootServiceName": "my-service",
      "rootTraceName": "GET /api/users",
      "startTimeUnixNano": "1704067200000000000",
      "durationMs": 42
    }
  ]
}
```

#### GET /tempo/api/echo

Health check for Tempo connection.

**Example:**
```bash
curl 'http://localhost:8085/tempo/api/echo'
```

**Response:**
```
echo
```

### OTLP Endpoints

#### POST /otlp/v1/traces

Push traces via OTLP.

**Use case:** observability-agents (Alloy) trace push

**Upstream:** `https://otlp-gateway-prod-us-east-2.grafana.net/otlp/v1/traces`

**Example:**
```bash
curl -X POST http://localhost:8085/otlp/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'
```

**Response:**
```json
{"partialSuccess": {}}
```

**Code anchor:** `src/routes/proxy.ts:77-82`

#### POST /otlp/v1/metrics

Push metrics via OTLP.

**Example:**
```bash
curl -X POST http://localhost:8085/otlp/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{"resourceMetrics":[]}'
```

#### POST /otlp/v1/logs

Push logs via OTLP.

**Example:**
```bash
curl -X POST http://localhost:8085/otlp/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[]}'
```

## Path Mapping Summary

| Proxy Path | Upstream Path | Grafana Service |
|------------|---------------|-----------------|
| `/api/prom/*` | `/api/prom/*` | Prometheus |
| `/prometheus/*` | `/api/prom/*` | Prometheus |
| `/loki/*` | `/loki/*` | Loki |
| `/tempo/*` | `/tempo/*` | Tempo |
| `/otlp/*` | `/otlp/*` | OTLP Gateway |

## Headers Injected

For all proxy requests, these headers are automatically added:

| Header | Value | Code Anchor |
|--------|-------|-------------|
| `Authorization` | `Basic base64({orgId}:{token})` | `src/config.ts:57-60` |
| `X-Scope-OrgID` | `{tenantId}` (defaults to orgId) | `src/routes/proxy.ts:31` |

## Error Responses

Errors from Grafana Cloud are passed through unchanged. Common errors:

| Status | Meaning | Common Cause |
|--------|---------|--------------|
| 400 | Bad Request | Invalid query syntax |
| 401 | Unauthorized | Invalid token or wrong org ID |
| 403 | Forbidden | Token lacks required scope |
| 404 | Not Found | Invalid path or resource |
| 429 | Too Many Requests | Rate limited by Grafana Cloud |
| 500 | Internal Server Error | Grafana Cloud error |
| 502 | Bad Gateway | Proxy couldn't reach upstream |

## Versioning

The proxy transparently forwards Grafana Cloud API versions. There is no separate versioning for the proxy itself.
