import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { status: 'ok' }
  })

  app.get('/ready', async () => {
    return { status: 'ok' }
  })
}
