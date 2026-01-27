export interface UpstreamConfig {
  url: string
  orgId: string
  tenantId?: string
}

export interface Config {
  upstreams: {
    prometheus: UpstreamConfig
    loki: UpstreamConfig
    tempo: UpstreamConfig
    otlp: UpstreamConfig
  }
  accessToken: string
  port: number
}
