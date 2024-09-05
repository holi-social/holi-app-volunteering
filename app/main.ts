import { logger, LogSeverity } from "./logging.ts";
import { serverConfigFromEnv, startServer } from "./server.ts";
import { instrumentationConfigFromEnv, setupInstrumentation } from "./instrumentation.ts";
import { environmentFromEnv } from "./environment.ts";

const environment = environmentFromEnv();

logger.setUpLogger(
  environment,
  environment === "development" ? LogSeverity.DEFAULT : LogSeverity.INFO,
);

const instrumentationConfig = instrumentationConfigFromEnv();
const serverConfig = serverConfigFromEnv();

const meter = setupInstrumentation(instrumentationConfig);
await startServer(serverConfig, meter);
