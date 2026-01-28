import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { registerHealthRoutes } from '../routes/health.js'

describe('health routes', () => {
  const app = Fastify()

  beforeAll(async () => {
    await registerHealthRoutes(app)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns {"status":"ok"}', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('GET /ready returns {"status":"ok"}', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})
