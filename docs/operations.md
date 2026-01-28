# Operations

How to operate, monitor, and troubleshoot grafana-lgmt-proxy in production.

## Health Checks

### Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health` | Liveness probe | `{"status":"ok"}` |
| `/ready` | Readiness probe | `{"status":"ok"}` |

**Code anchor:** `src/routes/health.ts:3-11`

### Kubernetes Probes

Configured in Helm values (`deployment/grafana-lgmt-proxy/values.yaml:39-57`):

```yaml
livenessProbe:
  path: /health
  port: 8085
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  path: /ready
  port: 8085
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Metrics

The proxy exposes Prometheus metrics at `/metrics`.

**Code anchor:** `src/routes/metrics.ts`

### Available Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `proxy_requests_total` | Counter | `upstream`, `method`, `status` | Total proxied requests |
| `proxy_request_duration_seconds` | Histogram | `upstream`, `method` | Request duration |

### Example Queries

```promql
# Request rate by upstream
rate(proxy_requests_total[5m])

# Error rate (5xx responses)
sum(rate(proxy_requests_total{status=~"5.."}[5m])) / sum(rate(proxy_requests_total[5m]))

# P99 latency by upstream
histogram_quantile(0.99, rate(proxy_request_duration_seconds_bucket[5m]))
```

### Grafana Dashboard

Create panels for:
1. Request rate by upstream (stacked area)
2. Error rate percentage (single stat with thresholds)
3. Latency percentiles (P50, P95, P99)
4. Request volume by status code (pie chart)

## Logging

Structured JSON logging via Pino. Log level: `info`.

**Code anchor:** `src/server.ts:8-15`

### Log Format

```json
{
  "level": 30,
  "time": 1769561580903,
  "pid": 66500,
  "hostname": "grafana-lgmt-proxy-abc123",
  "reqId": "req-1",
  "req": {
    "method": "GET",
    "url": "/prometheus/api/v1/query",
    "host": "localhost:8085"
  },
  "msg": "incoming request"
}
```

### Log Levels

| Level | Number | When Used |
|-------|--------|-----------|
| error | 50 | Unhandled errors, startup failures |
| warn | 40 | Recoverable issues |
| info | 30 | Request/response, startup, shutdown |
| debug | 20 | Detailed flow (not enabled by default) |

### Searching Logs

```bash
# Find errors
kubectl logs -l app=grafana-lgmt-proxy | jq 'select(.level >= 50)'

# Find slow requests (>1s)
kubectl logs -l app=grafana-lgmt-proxy | jq 'select(.responseTime > 1000)'

# Find requests to specific upstream
kubectl logs -l app=grafana-lgmt-proxy | jq 'select(.source | contains("/prometheus"))'
```

## Troubleshooting

### Proxy Returns 502 Bad Gateway

**Symptoms:** Requests to proxy return 502.

**Causes:**
1. Grafana Cloud endpoint unreachable
2. DNS resolution failure
3. Network policy blocking egress

**Checks:**
```bash
# Check pod logs
kubectl logs -l app=grafana-lgmt-proxy --tail=100

# Test connectivity from pod
kubectl exec -it deploy/grafana-lgmt-proxy -- curl -v https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/api/v1/status/buildinfo
```

### Proxy Returns 401 Unauthorized

**Symptoms:** Grafana Cloud returns 401 through the proxy.

**Causes:**
1. Invalid access token
2. Wrong org ID for the endpoint
3. Token lacks required scopes

**Checks:**
```bash
# Verify token is being injected (check logs for auth header presence)
kubectl logs -l app=grafana-lgmt-proxy | grep -i authorization

# Test token directly
curl -u "2668285:$TOKEN" https://prometheus-prod-56-prod-us-east-2.grafana.net/api/prom/api/v1/status/buildinfo
```

### High Latency

**Symptoms:** Proxy requests are slow.

**Causes:**
1. Grafana Cloud endpoint slow
2. DNS resolution slow
3. Resource constraints on proxy pods

**Checks:**
```bash
# Check P99 latency
kubectl exec -it deploy/grafana-lgmt-proxy -- curl -s localhost:8085/metrics | grep proxy_request_duration

# Check resource usage
kubectl top pod -l app=grafana-lgmt-proxy
```

### Pod Keeps Restarting

**Symptoms:** CrashLoopBackOff or frequent restarts.

**Causes:**
1. Missing required environment variables
2. secrets-manager-go failing to decrypt
3. KMS permissions issue (IRSA)

**Checks:**
```bash
# Check pod events
kubectl describe pod -l app=grafana-lgmt-proxy

# Check init container logs (secrets-manager-go)
kubectl logs -l app=grafana-lgmt-proxy -c init --previous

# Verify IRSA
kubectl get sa grafana-lgmt-proxy -o yaml | grep eks.amazonaws.com/role-arn
```

## Common Operations

### Restart Pods

```bash
kubectl rollout restart deployment/grafana-lgmt-proxy -n observability
```

### Check Current Config

```bash
kubectl exec -it deploy/grafana-lgmt-proxy -- env | grep GRAFANA_CLOUD
```

### Scale Replicas

```bash
kubectl scale deployment/grafana-lgmt-proxy --replicas=3 -n observability
```

### View Recent Logs

```bash
kubectl logs -l app=grafana-lgmt-proxy --tail=100 -f
```

## Runbook: Complete Outage

1. **Verify the problem**
   ```bash
   curl http://grafana-lgmt-proxy.observability:8085/health
   ```

2. **Check pod status**
   ```bash
   kubectl get pods -l app=grafana-lgmt-proxy -n observability
   ```

3. **Check recent events**
   ```bash
   kubectl get events -n observability --sort-by='.lastTimestamp' | tail -20
   ```

4. **Check Grafana Cloud status**
   - Visit https://status.grafana.com/

5. **Restart if needed**
   ```bash
   kubectl rollout restart deployment/grafana-lgmt-proxy -n observability
   ```

6. **Escalate if persists**
   - Check #observability Slack channel
   - Page on-call if critical consumers affected
