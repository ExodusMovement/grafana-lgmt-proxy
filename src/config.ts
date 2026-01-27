import { z } from 'zod'
import type { Config, UpstreamConfig } from './types.js'

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

function getEnvOrThrow(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function getUpstreamConfig(service: string): UpstreamConfig {
  const prefix = `GRAFANA_CLOUD_${service.toUpperCase()}`
  return {
    url: getEnvOrThrow(`${prefix}_URL`),
    orgId: getEnvOrThrow(`${prefix}_ORG_ID`),
    tenantId: process.env[`${prefix}_TENANT_ID`] || undefined,
  }
}

export function loadConfig(): Config {
  const rawConfig = {
    upstreams: {
      prometheus: getUpstreamConfig('prometheus'),
      loki: getUpstreamConfig('loki'),
      tempo: getUpstreamConfig('tempo'),
      otlp: getUpstreamConfig('otlp'),
    },
    accessToken: getEnvOrThrow('GRAFANA_CLOUD_ACCESS_TOKEN'),
    port: parseInt(process.env.PORT || '8085', 10),
  }

  return configSchema.parse(rawConfig)
}

export function getTenantId(upstream: UpstreamConfig): string {
  return upstream.tenantId || upstream.orgId
}

export function getAuthHeader(upstream: UpstreamConfig, accessToken: string): string {
  const credentials = `${upstream.orgId}:${accessToken}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}
