import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { createServer } from '../server.js'
import type { Config } from '../types.js'

let mockUpstream: FastifyInstance
let mockPort: number
let capturedHeaders: Record<string, string | string[] | undefined> = {}
let capturedPath: string = ''
let mockStatusCode = 200
let mockResponseBody: unknown = { success: true }

async function startMockUpstream(): Promise<number> {
  mockUpstream = Fastify({ logger: false })

  mockUpstream.all('/*', async (request, reply) => {
    capturedHeaders = { ...request.headers }
    capturedPath = request.url
    reply.status(mockStatusCode).send(mockResponseBody)
  })

  const address = await mockUpstream.listen({ port: 0, host: '127.0.0.1' })
  return parseInt(new URL(address).port, 10)
}

describe('proxy routes', () => {
  let app: Awaited<ReturnType<typeof createServer>>
  let config: Config

  beforeAll(async () => {
    mockPort = await startMockUpstream()

    config = {
      upstreams: {
        prometheus: { url: `http://127.0.0.1:${mockPort}`, orgId: '111', tenantId: 'prom-tenant' },
        loki: { url: `http://127.0.0.1:${mockPort}`, orgId: '222' },
        tempo: { url: `http://127.0.0.1:${mockPort}`, orgId: '333' },
        otlp: { url: `http://127.0.0.1:${mockPort}`, orgId: '444' },
      },
      accessToken: 'test-access-token',
      port: 8085,
    }

    app = await createServer(config)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await mockUpstream.close()
  })

  it('POST /api/prom/push forwards with auth headers', async () => {
    capturedHeaders = {}
    mockStatusCode = 200
    mockResponseBody = { success: true }

    const response = await app.inject({
      method: 'POST',
      url: '/api/prom/push',
      payload: { metrics: [] },
    })

    expect(response.statusCode).toBe(200)
    expect(capturedPath).toBe('/api/prom/push')
    expect(capturedHeaders['x-scope-orgid']).toBe('prom-tenant')
    expect(capturedHeaders['authorization']).toBe(`Basic ${Buffer.from('111:test-access-token').toString('base64')}`)
  })

  it('GET /prometheus/api/v1/query forwards with auth headers', async () => {
    capturedHeaders = {}
    mockStatusCode = 200
    mockResponseBody = { status: 'success', data: {} }

    const response = await app.inject({
      method: 'GET',
      url: '/prometheus/api/v1/query?query=up',
    })

    expect(response.statusCode).toBe(200)
    expect(capturedPath).toBe('/api/prom/api/v1/query?query=up')
    expect(capturedHeaders['x-scope-orgid']).toBe('prom-tenant')
    expect(capturedHeaders['authorization']).toContain('Basic')
  })

  it('POST /otlp/v1/traces forwards with auth headers', async () => {
    capturedHeaders = {}
    mockStatusCode = 200
    mockResponseBody = { partialSuccess: {} }

    const response = await app.inject({
      method: 'POST',
      url: '/otlp/v1/traces',
      payload: { resourceSpans: [] },
    })

    expect(response.statusCode).toBe(200)
    expect(capturedPath).toBe('/otlp/v1/traces')
    expect(capturedHeaders['x-scope-orgid']).toBe('444')
    expect(capturedHeaders['authorization']).toBe(`Basic ${Buffer.from('444:test-access-token').toString('base64')}`)
  })

  it('POST /loki/loki/api/v1/push forwards with auth headers', async () => {
    capturedHeaders = {}
    mockStatusCode = 204
    mockResponseBody = null

    const response = await app.inject({
      method: 'POST',
      url: '/loki/loki/api/v1/push',
      payload: { streams: [] },
    })

    expect(response.statusCode).toBe(204)
    expect(capturedPath).toBe('/loki/loki/api/v1/push')
    expect(capturedHeaders['x-scope-orgid']).toBe('222')
  })

  it('uses orgId when tenantId not specified', async () => {
    capturedHeaders = {}
    mockStatusCode = 204
    mockResponseBody = null

    const response = await app.inject({
      method: 'POST',
      url: '/loki/push',
      payload: {},
    })

    expect(response.statusCode).toBe(204)
    expect(capturedHeaders['x-scope-orgid']).toBe('222')
  })

  it('returns upstream errors transparently', async () => {
    capturedHeaders = {}
    mockStatusCode = 429
    mockResponseBody = { error: 'rate limit exceeded' }

    const response = await app.inject({
      method: 'POST',
      url: '/api/prom/push',
      payload: {},
    })

    expect(response.statusCode).toBe(429)
    expect(JSON.parse(response.body)).toEqual({ error: 'rate limit exceeded' })
  })

  it('GET /tempo/api/traces forwards correctly', async () => {
    capturedHeaders = {}
    mockStatusCode = 200
    mockResponseBody = { traces: [] }

    const response = await app.inject({
      method: 'GET',
      url: '/tempo/api/traces/123',
    })

    expect(response.statusCode).toBe(200)
    expect(capturedPath).toBe('/tempo/api/traces/123')
    expect(capturedHeaders['x-scope-orgid']).toBe('333')
  })
})
