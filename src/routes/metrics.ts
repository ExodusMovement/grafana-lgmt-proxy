import type { FastifyInstance } from 'fastify'
import { register, Counter, Histogram } from 'prom-client'

export const proxyRequestsTotal = new Counter({
  name: 'proxy_requests_total',
  help: 'Total number of proxy requests',
  labelNames: ['upstream', 'method', 'status'] as const,
})

export const proxyRequestDuration = new Histogram({
  name: 'proxy_request_duration_seconds',
  help: 'Duration of proxy requests in seconds',
  labelNames: ['upstream', 'method'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
})

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType)
    return register.metrics()
  })
}
