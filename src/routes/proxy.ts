import type { FastifyInstance } from 'fastify'
import httpProxy from '@fastify/http-proxy'
import type { Config, UpstreamConfig } from '../types.js'
import { getAuthHeader, getTenantId } from '../config.js'
import { proxyRequestsTotal, proxyRequestDuration } from './metrics.js'

interface ProxyRouteConfig {
  prefix: string
  upstream: UpstreamConfig
  upstreamName: string
  rewritePrefix?: string
}

async function registerProxyRoute(
  app: FastifyInstance,
  config: Config,
  routeConfig: ProxyRouteConfig
): Promise<void> {
  const { prefix, upstream, upstreamName, rewritePrefix } = routeConfig

  await app.register(httpProxy, {
    upstream: upstream.url,
    prefix,
    rewritePrefix: rewritePrefix ?? '',
    http2: false,
    replyOptions: {
      rewriteRequestHeaders: (_request, headers) => {
        return {
          ...headers,
          authorization: getAuthHeader(upstream, config.accessToken),
          'x-scope-orgid': getTenantId(upstream),
        }
      },
    },
    preHandler: async (request) => {
      const timer = proxyRequestDuration.startTimer({ upstream: upstreamName, method: request.method })
      request.proxyTimer = timer
      request.proxyUpstream = upstreamName
    },
  })
}

declare module 'fastify' {
  interface FastifyRequest {
    proxyTimer?: () => number
    proxyUpstream?: string
  }
}

export async function registerProxyRoutes(app: FastifyInstance, config: Config): Promise<void> {
  app.addHook('onResponse', async (request, reply) => {
    if (request.proxyUpstream) {
      proxyRequestsTotal.inc({
        upstream: request.proxyUpstream,
        method: request.method,
        status: reply.statusCode,
      })
      if (request.proxyTimer) {
        request.proxyTimer()
      }
    }
  })

  const routes: ProxyRouteConfig[] = [
    {
      prefix: '/api/prom',
      upstream: config.upstreams.prometheus,
      upstreamName: 'prometheus',
      rewritePrefix: '/api/prom',
    },
    {
      prefix: '/prometheus',
      upstream: config.upstreams.prometheus,
      upstreamName: 'prometheus',
      rewritePrefix: '',
    },
    {
      prefix: '/otlp',
      upstream: config.upstreams.otlp,
      upstreamName: 'otlp',
      rewritePrefix: '/otlp',
    },
    {
      prefix: '/loki',
      upstream: config.upstreams.loki,
      upstreamName: 'loki',
      rewritePrefix: '/loki',
    },
    {
      prefix: '/tempo',
      upstream: config.upstreams.tempo,
      upstreamName: 'tempo',
      rewritePrefix: '/tempo',
    },
  ]

  for (const route of routes) {
    await registerProxyRoute(app, config, route)
  }
}
