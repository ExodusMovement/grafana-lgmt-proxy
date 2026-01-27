import { loadConfig } from './config.js'
import { createServer } from './server.js'

async function main() {
  const config = loadConfig()
  const server = await createServer(config)

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' })
  } catch (error) {
    server.log.error(error)
    process.exit(1)
  }

  const shutdown = async () => {
    server.log.info('Shutting down...')
    await server.close()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main()
