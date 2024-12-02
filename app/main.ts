import { logger, LogSeverity } from './logging.ts'
import { createPostgresClient, startServer } from './server.ts'
import { Sentry } from './deps.ts'
import { environment, serverConfigFromEnv } from './config.ts'

logger.setUpLogger(
  environment,
  environment === 'development' ? LogSeverity.DEFAULT : LogSeverity.INFO,
)

const sentryDSN = Deno.env.get('SENTRY_DSN')
if (!sentryDSN) {
  logger.warn('Environment variable "SENTRY_DSN" is not set, starting without Sentry integration...')
} else {
  const TRACING_SAMPLE_RATE = 0.25
  const TRACING_SAMPLE_RATE_DEVELOPMENT = 0.0
  Sentry.init({
    dsn: sentryDSN,
    tracesSampleRate: environment === 'development' ? TRACING_SAMPLE_RATE_DEVELOPMENT : TRACING_SAMPLE_RATE,
    environment,
  })
}

const config = serverConfigFromEnv()
const sql = createPostgresClient(config)
const server = startServer(config, sql)

for (const signal of ['SIGINT', 'SIGTERM'] as Deno.Signal[]) {
  Deno.addSignalListener(signal, async () => {
    const shutdownTimeout = new Promise((_resolve, _reject) => {
      setTimeout(() => {
        console.log('Shutdown timeout reached - forcing exit')
        Deno.exit(1)
      }, 5000)
    })
    const shutdown = async (): Promise<void> => {
      logger.info(`Received signal ${signal}`)
      logger.info('Shutting down server')
      await server.shutdown()
      await server.finished
      logger.info('Shutting down Postgres client')
      await sql.end()
      logger.info('Done shutting done. Bye :)')
      Deno.exit()
    }
    await Promise.race([
      shutdown(),
      shutdownTimeout,
    ])
  })
}
