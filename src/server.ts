import Fastify from 'fastify'
import type { Config } from './types.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerMetricsRoutes } from './routes/metrics.js'
import { registerProxyRoutes } from './routes/proxy.js'

export async function createServer(config: Config) {
  const app = Fastify({
    logger: {
      level: 'info',
      redact: ['req.headers.authorization', 'req.headers["x-scope-orgid"]'],
      transport: {
        target: 'pino/file',
        options: { destination: 1 },
      },
    },
    disableRequestLogging: false,
  })

  await registerHealthRoutes(app)
  await registerMetricsRoutes(app)
  await registerProxyRoutes(app, config)

  return app
}
