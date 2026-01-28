# Architecture

This document describes the architecture of grafana-lgmt-proxy using C4 diagrams and code anchors.

## C4 Container Diagram

High-level view showing the proxy in context with external systems.

```mermaid
flowchart TB
    subgraph K8s["Kubernetes Cluster"]
        subgraph Consumers["Consumer Services"]
            KC["kubecost/opencost"]
            OA["observability-agents<br/>(Alloy)"]
            Other["Other Services"]
        end

        subgraph Proxy["grafana-lgmt-proxy"]
            App["Fastify Server<br/>:8085"]
        end

        SA["ServiceAccount<br/>+ IRSA"]
    end

    subgraph AWS["AWS"]
        KMS[("KMS CMK<br/>RSA_4096")]
        SM["secrets-manager-go<br/>(init binary)"]
    end

    subgraph GC["Grafana Cloud"]
        Prom["Prometheus/Mimir<br/>prometheus-prod-56"]
        Loki["Loki<br/>logs-prod-036"]
        Tempo["Tempo<br/>tempo-prod-26"]
        OTLP["OTLP Gateway<br/>otlp-gateway-prod"]
    end

    KC -->|"/prometheus/*"| App
    OA -->|"/api/prom/push<br/>/otlp/*"| App
    Other -->|"/loki/*<br/>/tempo/*"| App

    SA -->|"IRSA"| KMS
    SM -->|"decrypt"| KMS
    SM -->|"inject env"| App

    App -->|"Basic Auth<br/>X-Scope-OrgID"| Prom
    App -->|"Basic Auth<br/>X-Scope-OrgID"| Loki
    App -->|"Basic Auth<br/>X-Scope-OrgID"| Tempo
    App -->|"Basic Auth"| OTLP
```

## C4 Component Diagram

Internal components of the Fastify server.

```mermaid
flowchart TB
    subgraph Server["Fastify Server (src/server.ts)"]
        Entry["index.ts<br/>Entry Point"]
        Config["config.ts<br/>Zod Validation"]

        subgraph Routes["Routes"]
            Health["health.ts<br/>/health, /ready"]
            Metrics["metrics.ts<br/>/metrics"]
            Proxy["proxy.ts<br/>Proxy Routes"]
        end

        subgraph ProxyRoutes["Proxy Route Handlers"]
            PromPush["/api/prom/*"]
            PromQuery["/prometheus/*"]
            LokiRoute["/loki/*"]
            TempoRoute["/tempo/*"]
            OTLPRoute["/otlp/*"]
        end
    end

    Entry --> Config
    Entry --> Health
    Entry --> Metrics
    Entry --> Proxy

    Proxy --> PromPush
    Proxy --> PromQuery
    Proxy --> LokiRoute
    Proxy --> TempoRoute
    Proxy --> OTLPRoute

    PromPush & PromQuery -->|"rewrite to /api/prom/*"| GCProm["Grafana Cloud<br/>Prometheus"]
    LokiRoute -->|"rewrite to /loki/*"| GCLoki["Grafana Cloud<br/>Loki"]
    TempoRoute -->|"rewrite to /tempo/*"| GCTempo["Grafana Cloud<br/>Tempo"]
    OTLPRoute -->|"rewrite to /otlp/*"| GCOTLP["Grafana Cloud<br/>OTLP"]
```

## Code Anchors

| Component | File | Key Functions/Symbols |
|-----------|------|----------------------|
| Entry point | `src/index.ts` | `main()`, shutdown handlers |
| Server setup | `src/server.ts` | `createServer()` |
| Config loading | `src/config.ts` | `loadConfig()`, `configSchema`, `getAuthHeader()` |
| Type definitions | `src/types.ts` | `Config`, `UpstreamConfig` |
| Health routes | `src/routes/health.ts` | `registerHealthRoutes()` |
| Metrics routes | `src/routes/metrics.ts` | `registerMetricsRoutes()`, `proxyRequestsTotal` |
| Proxy routes | `src/routes/proxy.ts` | `registerProxyRoutes()`, `registerProxyRoute()` |

## Sequence Diagram: Prometheus Query

Shows the full request flow for a Prometheus query from kubecost.

```mermaid
sequenceDiagram
    participant KC as kubecost
    participant Proxy as grafana-lgmt-proxy
    participant GC as Grafana Cloud<br/>Prometheus

    KC->>Proxy: GET /prometheus/api/v1/query?query=up

    Note over Proxy: Load config from env
    Note over Proxy: config.ts:38-50 loadConfig()

    Note over Proxy: Generate auth header
    Note over Proxy: config.ts:57-60 getAuthHeader()

    Note over Proxy: Rewrite path
    Note over Proxy: /prometheus/* → /api/prom/*
    Note over Proxy: proxy.ts:72-76

    Proxy->>GC: GET /api/prom/api/v1/query?query=up<br/>Authorization: Basic {orgId:token}<br/>X-Scope-OrgID: {orgId}

    GC-->>Proxy: 200 OK + JSON metrics

    Note over Proxy: Record metrics
    Note over Proxy: metrics.ts proxyRequestsTotal

    Proxy-->>KC: 200 OK + JSON metrics
```

## Sequence Diagram: OTLP Trace Push

Shows the flow for observability-agents pushing traces via OTLP.

```mermaid
sequenceDiagram
    participant Alloy as observability-agents
    participant Proxy as grafana-lgmt-proxy
    participant GC as Grafana Cloud<br/>OTLP Gateway

    Alloy->>Proxy: POST /otlp/v1/traces<br/>Content-Type: application/json<br/>{"resourceSpans":[...]}

    Note over Proxy: Generate auth header
    Note over Proxy: orgId=1372025 (OTLP)

    Proxy->>GC: POST /otlp/v1/traces<br/>Authorization: Basic {orgId:token}<br/>{"resourceSpans":[...]}

    GC-->>Proxy: 200 OK {"partialSuccess":{}}

    Proxy-->>Alloy: 200 OK {"partialSuccess":{}}
```

## Data Flow

```mermaid
flowchart LR
    subgraph Input["Incoming Requests"]
        R1["Metrics Push<br/>/api/prom/push"]
        R2["Metrics Query<br/>/prometheus/*"]
        R3["Logs<br/>/loki/*"]
        R4["Traces Query<br/>/tempo/*"]
        R5["OTLP<br/>/otlp/*"]
    end

    subgraph Transform["Header Injection"]
        Auth["Add Authorization<br/>Basic {orgId:token}"]
        Scope["Add X-Scope-OrgID<br/>{tenantId}"]
    end

    subgraph Output["Grafana Cloud"]
        P["Prometheus<br/>orgId: 2668285"]
        L["Loki<br/>orgId: 1329819"]
        T["Tempo<br/>orgId: 1324130"]
        O["OTLP<br/>orgId: 1372025"]
    end

    R1 & R2 --> Auth --> P
    R3 --> Auth --> L
    R4 --> Auth --> T
    R5 --> Auth --> O

    Auth --> Scope
```

## Path Rewriting

The proxy rewrites incoming paths to match Grafana Cloud API expectations:

| Incoming Path | Upstream Path | Code Anchor |
|---------------|---------------|-------------|
| `/api/prom/*` | `/api/prom/*` | `proxy.ts:64-70` |
| `/prometheus/*` | `/api/prom/*` | `proxy.ts:71-76` |
| `/loki/*` | `/loki/*` | `proxy.ts:83-88` |
| `/tempo/*` | `/tempo/*` | `proxy.ts:89-94` |
| `/otlp/*` | `/otlp/*` | `proxy.ts:77-82` |

## Infrastructure

### Runtime

- **Container**: Node.js 20 on Amazon Linux 2023 base
- **Orchestration**: Kubernetes (EKS)
- **Replicas**: 2 (configurable via Helm)
- **Resources**: 250m-1000m CPU, 256Mi-512Mi memory

### Secrets

- **Storage**: AWS Secrets Manager (encrypted values in Helm)
- **Decryption**: secrets-manager-go binary via KMS
- **Access**: IRSA (IAM Roles for Service Accounts)

### Network

- **Ingress**: ClusterIP service on port 8085
- **Egress**: HTTPS to Grafana Cloud endpoints (*.grafana.net)

## Assumptions

1. Single access token works for all Grafana Cloud services (Prometheus, Loki, Tempo, OTLP)
2. Consumers are within the same Kubernetes cluster
3. IRSA is configured for KMS decrypt permissions
4. Network policies allow egress to Grafana Cloud

## Out of Scope

- Rate limiting (handled by Grafana Cloud)
- Request caching
- Multi-tenancy (single Grafana Cloud stack)
- mTLS between consumers and proxy

## Maintenance Rule

When making changes that affect architecture:
1. Update relevant diagrams in this document
2. Update code anchors if file paths or function names change
3. Include architecture doc updates in the same PR as code changes
