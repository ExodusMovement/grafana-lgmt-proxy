import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, getTenantId, getAuthHeader } from '../config.js'
import type { UpstreamConfig } from '../types.js'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function setRequiredEnvVars() {
    process.env.GRAFANA_CLOUD_PROMETHEUS_URL = 'https://prometheus.example.com'
    process.env.GRAFANA_CLOUD_PROMETHEUS_ORG_ID = '123'
    process.env.GRAFANA_CLOUD_LOKI_URL = 'https://loki.example.com'
    process.env.GRAFANA_CLOUD_LOKI_ORG_ID = '456'
    process.env.GRAFANA_CLOUD_TEMPO_URL = 'https://tempo.example.com'
    process.env.GRAFANA_CLOUD_TEMPO_ORG_ID = '789'
    process.env.GRAFANA_CLOUD_OTLP_URL = 'https://otlp.example.com'
    process.env.GRAFANA_CLOUD_OTLP_ORG_ID = '012'
    process.env.GRAFANA_CLOUD_ACCESS_TOKEN = 'test-token'
  }

  it('throws when ACCESS_TOKEN missing', () => {
    setRequiredEnvVars()
    delete process.env.GRAFANA_CLOUD_ACCESS_TOKEN
    expect(() => loadConfig()).toThrow('Missing required environment variable: GRAFANA_CLOUD_ACCESS_TOKEN')
  })

  it('throws when PROMETHEUS_URL missing', () => {
    setRequiredEnvVars()
    delete process.env.GRAFANA_CLOUD_PROMETHEUS_URL
    expect(() => loadConfig()).toThrow('Missing required environment variable: GRAFANA_CLOUD_PROMETHEUS_URL')
  })

  it('uses default port 8085', () => {
    setRequiredEnvVars()
    const config = loadConfig()
    expect(config.port).toBe(8085)
  })

  it('uses custom port when PORT env set', () => {
    setRequiredEnvVars()
    process.env.PORT = '9000'
    const config = loadConfig()
    expect(config.port).toBe(9000)
  })

  it('loads all upstream configs correctly', () => {
    setRequiredEnvVars()
    const config = loadConfig()
    expect(config.upstreams.prometheus.url).toBe('https://prometheus.example.com')
    expect(config.upstreams.prometheus.orgId).toBe('123')
    expect(config.upstreams.loki.orgId).toBe('456')
    expect(config.upstreams.tempo.orgId).toBe('789')
    expect(config.upstreams.otlp.orgId).toBe('012')
  })

  it('allows custom tenantId override', () => {
    setRequiredEnvVars()
    process.env.GRAFANA_CLOUD_PROMETHEUS_TENANT_ID = 'custom-tenant'
    const config = loadConfig()
    expect(config.upstreams.prometheus.tenantId).toBe('custom-tenant')
  })
})

describe('getTenantId', () => {
  it('returns tenantId when specified', () => {
    const upstream: UpstreamConfig = { url: 'https://example.com', orgId: '123', tenantId: 'tenant-456' }
    expect(getTenantId(upstream)).toBe('tenant-456')
  })

  it('returns orgId when tenantId not specified', () => {
    const upstream: UpstreamConfig = { url: 'https://example.com', orgId: '123' }
    expect(getTenantId(upstream)).toBe('123')
  })
})

describe('getAuthHeader', () => {
  it('returns Basic auth header with base64 encoded credentials', () => {
    const upstream: UpstreamConfig = { url: 'https://example.com', orgId: '123' }
    const header = getAuthHeader(upstream, 'secret-token')
    const expected = `Basic ${Buffer.from('123:secret-token').toString('base64')}`
    expect(header).toBe(expected)
  })
})
