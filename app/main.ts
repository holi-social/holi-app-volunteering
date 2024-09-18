import { logger, LogSeverity } from "./logging.ts";
import { startServer } from "./server.ts";
import { Sentry } from "./deps.ts";
import { environment, serverConfigFromEnv } from "./config.ts";

logger.setUpLogger(
  environment,
  environment === "development" ? LogSeverity.DEFAULT : LogSeverity.INFO,
);

const sentryDSN = Deno.env.get("SENTRY_DSN");
if (!sentryDSN) {
  logger.warn('Environment variable "SENTRY_DSN" is not set, starting without Sentry integration...');
} else {
  const TRACING_SAMPLE_RATE = 0.25;
  const TRACING_SAMPLE_RATE_DEVELOPMENT = 0.0;
  Sentry.init({
    dsn: sentryDSN,
    tracesSampleRate: environment === "development" ? TRACING_SAMPLE_RATE_DEVELOPMENT : TRACING_SAMPLE_RATE,
    environment,
  });
}

startServer(serverConfigFromEnv());
