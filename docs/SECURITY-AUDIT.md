# Security Audit Report: grafana-lgmt-proxy

**Auditor:** Trail of Bits methodology (automated analysis)
**Date:** 2026-01-27
**Commit:** `gio/security-review` branch
**Methodology:** audit-context-building, sharp-edges, static-analysis, differential-review, variant-analysis

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 4 |
| Informational | 3 |

Overall assessment: The codebase follows security best practices with Zod validation, proper credential handling, and read-only container filesystems. However, several areas require attention, particularly around authentication/authorization of incoming requests and shell injection in the entrypoint script.

---

## Findings

### HIGH-001: No Authentication on Incoming Proxy Requests

**Location:** `src/routes/proxy.ts:14-41`, `src/server.ts:7-24`
**Category:** Missing Access Control
**CVSS:** 7.5 (High)

**Description:**
The proxy forwards requests to Grafana Cloud without authenticating the incoming client. Any pod in the Kubernetes cluster with network access to the proxy can send arbitrary metrics, logs, and traces to Grafana Cloud using the organization's credentials.

**Attack Scenario:**
```
Attacker Pod in Cluster → grafana-lgmt-proxy:8085 → Grafana Cloud (authenticated)
```

A compromised or malicious pod could:
- Push fake metrics to Grafana Cloud (data integrity)
- Exhaust Grafana Cloud ingest quotas (DoS)
- Inject malicious log entries (audit trail pollution)
- Push traces for non-existent services (noise attack)

**Impact:**
- Data integrity compromise
- Cost amplification via quota exhaustion
- Audit trail pollution

**Recommendation:**
```typescript
// Option 1: Kubernetes NetworkPolicy (infrastructure-level)
// Restrict ingress to only known consumers

// Option 2: Bearer token validation (application-level)
app.addHook('preHandler', async (request, reply) => {
  const token = request.headers['x-proxy-token']
  if (!token || token !== config.proxyAuthToken) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})
```

---

### MEDIUM-001: Shell Injection Risk in entrypoint.sh

**Location:** `entrypoint.sh:5`
**Category:** Command Injection
**CVSS:** 5.3 (Medium)

**Description:**
```bash
eval $(secrets-manager-go --kms-key "$KMS_KEY_ALIAS" -- env | grep GRAFANA_CLOUD)
```

The `eval` command executes arbitrary output from `secrets-manager-go`. While `secrets-manager-go` is a trusted binary, if it ever outputs unexpected data (malformed secrets, error messages with shell metacharacters), this could result in command injection.

**Proof of Concept:**
If `secrets-manager-go` outputs: `GRAFANA_CLOUD_TOKEN='$(whoami)'`, the `eval` would execute the subshell.

**Impact:**
Container compromise if secrets-manager-go is compromised or returns malformed data.

**Recommendation:**
```bash
# Safer approach using export directly
if [ -n "$KMS_KEY_ALIAS" ]; then
  secrets-manager-go --kms-key "$KMS_KEY_ALIAS" -- env | \
    grep '^GRAFANA_CLOUD_' | \
    while IFS='=' read -r key value; do
      # Validate key format
      if echo "$key" | grep -qE '^GRAFANA_CLOUD_[A-Z_]+$'; then
        export "$key=$value"
      fi
    done
fi
```

Or better: switch to direct invocation pattern that doesn't require shell eval.

---

### MEDIUM-002: Credentials Logged in Debug Mode

**Location:** `src/server.ts:8-17`
**Category:** Information Disclosure
**CVSS:** 4.3 (Medium)

**Description:**
The Fastify server has request logging enabled (`disableRequestLogging: false`). While the Authorization header is set in the proxy layer, if debug logging is enabled or logging level is changed, credentials could be logged.

```typescript
const app = Fastify({
  logger: {
    level: 'info',  // Could be changed to 'debug'
    ...
  },
  disableRequestLogging: false,  // Logs request metadata
})
```

**Impact:**
Credentials exposure in logs if log level is changed to debug.

**Recommendation:**
```typescript
// Add header redaction
const app = Fastify({
  logger: {
    level: 'info',
    redact: ['req.headers.authorization', 'res.headers["set-cookie"]'],
  },
})
```

---

### MEDIUM-003: No Request Body Size Limits

**Location:** `src/server.ts`, `src/routes/proxy.ts`
**Category:** Resource Exhaustion
**CVSS:** 4.3 (Medium)

**Description:**
No explicit body size limits are configured. An attacker could send extremely large payloads to exhaust memory.

**Impact:**
Denial of Service via memory exhaustion.

**Recommendation:**
```typescript
const app = Fastify({
  bodyLimit: 10 * 1024 * 1024,  // 10MB limit
  // ...
})
```

---

### LOW-001: Development Dependency Vulnerability

**Location:** `package.json` (vitest → vite → esbuild@0.21.5)
**Category:** Known Vulnerability
**CVSS:** 3.1 (Low)

**Description:**
```
Vulnerability: GHSA-67mh-4wv8-2f99
Package: esbuild <=0.24.2
Severity: Moderate
```

This is a **development-only** dependency (vitest). It does not affect production builds.

**Impact:**
Low - only affects development environment, not production.

**Recommendation:**
Update vitest when a patched version is available:
```bash
pnpm update vitest@latest
```

---

### LOW-002: HTTP/2 Explicitly Disabled

**Location:** `src/routes/proxy.ts:25`
**Category:** Configuration
**CVSS:** 2.1 (Low)

**Description:**
```typescript
http2: false,
```

HTTP/2 is explicitly disabled. While this is intentional (Grafana Cloud uses HTTP/1.1), it prevents potential performance benefits and multiplexing.

**Impact:**
Performance - no security impact.

**Recommendation:**
Document the reason for this configuration choice. Consider enabling HTTP/2 if Grafana Cloud supports it.

---

### LOW-003: No Rate Limiting

**Location:** `src/routes/proxy.ts`, `src/server.ts`
**Category:** Resource Exhaustion
**CVSS:** 3.1 (Low)

**Description:**
No rate limiting is implemented. While Grafana Cloud has its own rate limits, the proxy could be overwhelmed before requests reach upstream.

**Impact:**
Proxy-level DoS before Grafana Cloud rate limits kick in.

**Recommendation:**
```typescript
import rateLimit from '@fastify/rate-limit'

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
})
```

---

### LOW-004: Port Parsing Without Bounds Check

**Location:** `src/config.ts:47`
**Category:** Input Validation
**CVSS:** 2.1 (Low)

**Description:**
```typescript
port: parseInt(process.env.PORT || '8085', 10)
```

While Zod validates `z.number().int().positive()`, extremely large port values (e.g., 99999) would fail at runtime, not at validation.

**Impact:**
Startup failure with confusing error if PORT > 65535.

**Recommendation:**
```typescript
port: z.number().int().min(1).max(65535).default(8085),
```

---

### INFO-001: Upstream URLs Not Validated for HTTPS

**Location:** `src/config.ts:5`
**Category:** Defense in Depth

**Description:**
```typescript
url: z.string().url(),
```

The schema allows any valid URL, including `http://`. Production should enforce HTTPS.

**Recommendation:**
```typescript
url: z.string().url().refine(
  (url) => url.startsWith('https://'),
  { message: 'Upstream URL must use HTTPS' }
),
```

---

### INFO-002: Credentials in Memory

**Location:** `src/config.ts:46`, `src/routes/proxy.ts:30`
**Category:** Information

**Description:**
The access token is loaded into memory at startup and kept for the lifetime of the process. This is standard practice but worth noting for threat modeling.

**Mitigation in Place:**
- Read-only root filesystem prevents core dumps
- IRSA provides least-privilege access
- Token is not logged

---

### INFO-003: Missing Content-Type Validation

**Location:** `src/routes/proxy.ts`
**Category:** Defense in Depth

**Description:**
The proxy forwards requests without validating Content-Type headers. This is acceptable for a transparent proxy but limits ability to detect malformed requests.

**Recommendation:**
Consider validating Content-Type for known endpoints (e.g., `/api/prom/push` should be `application/x-protobuf`).

---

## Positive Findings

The following security controls are correctly implemented:

| Control | Location | Status |
|---------|----------|--------|
| Zod input validation | `src/config.ts:4-19` | ✅ Implemented |
| Read-only root filesystem | `deployment/values.yaml:74` | ✅ Enabled |
| Non-root user | `Dockerfile:21` | ✅ USER node |
| Graceful shutdown | `src/index.ts:15-22` | ✅ SIGTERM/SIGINT |
| No eval/exec in app code | `src/**/*.ts` | ✅ Clean |
| Structured logging | `src/server.ts:9-16` | ✅ JSON via Pino |
| Secrets via KMS | `entrypoint.sh:4-6` | ✅ Not in env vars |
| IRSA for AWS access | `deployment/values-*.yaml` | ✅ Least privilege |

---

## Trust Boundaries

```
┌───────────────────────────────────────────────────────────────────┐
│ Kubernetes Cluster (Trusted Network)                              │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐  │
│  │ Consumers   │───▶│ grafana-lgmt-    │───▶│ Grafana Cloud   │  │
│  │ (alloy,     │    │ proxy            │    │ (External)      │  │
│  │ kubecost)   │    │                  │    │                 │  │
│  └─────────────┘    │ [TRUST BOUNDARY] │    └─────────────────┘  │
│                     │ - No auth on     │                         │
│                     │   ingress        │                         │
│                     │ - Adds auth on   │                         │
│                     │   egress         │                         │
│                     └──────────────────┘                         │
│                              │                                    │
│                              ▼                                    │
│                     ┌──────────────────┐                         │
│                     │ AWS KMS/Secrets  │                         │
│                     │ (via IRSA)       │                         │
│                     └──────────────────┘                         │
└───────────────────────────────────────────────────────────────────┘
```

**Key Trust Assumptions:**
1. All pods in the cluster with network access are trusted (VIOLATED if cluster is multi-tenant)
2. `secrets-manager-go` binary is trusted
3. Grafana Cloud endpoints are correctly configured
4. KMS keys are properly secured

---

## Recommendations Summary

| Priority | Finding | Action |
|----------|---------|--------|
| P1 | HIGH-001 | Implement NetworkPolicy or app-level auth |
| P2 | MEDIUM-001 | Refactor entrypoint.sh to avoid eval |
| P2 | MEDIUM-002 | Add log redaction for sensitive headers |
| P2 | MEDIUM-003 | Add bodyLimit configuration |
| P3 | LOW-003 | Consider rate limiting |
| P3 | INFO-001 | Enforce HTTPS in URL validation |

---

## Appendix: Methodology

### Phase 1: Audit Context Building
- Line-by-line analysis of all source files
- Dependency tree inspection
- Configuration review

### Phase 2: Sharp Edges Analysis
Applied Trail of Bits "Three Adversaries" model:
- **Scoundrel**: Can disable security via config? → No obvious misconfigurations
- **Lazy Developer**: Is copy-paste secure? → Credentials properly injected
- **Confused Developer**: Can params be swapped? → Zod validation prevents

### Phase 3: Static Analysis
- pnpm audit: 1 moderate (dev-only)
- Grep patterns: No dangerous patterns found
- No eval/exec/Function in application code

### Phase 4: Differential Review
- Git history analysis: 23 commits
- Security-relevant commits: a832442 (auth injection), cf6f924 (entrypoint)
- No regressions detected

### Phase 5: Variant Analysis
- Searched for: SSRF, header injection, request smuggling patterns
- Result: No vulnerable patterns found

---

## Attestation

This audit was conducted using Trail of Bits security review methodologies applied programmatically. It is not a substitute for a manual penetration test or formal security assessment.
