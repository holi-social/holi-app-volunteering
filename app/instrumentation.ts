import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ConsoleMetricExporter,
  ConsoleSpanExporter,
  NodeSDK,
  PeriodicExportingMetricReader,
  Resource,
} from "./deps.ts";
import { logger } from "./logging.ts";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: "holi-app-volunteering",
  [ATTR_SERVICE_VERSION]: "1.0", // TODO pass in version = git hash
});

// TODO probably use GRPC exporter for production
const traceExporter = new ConsoleSpanExporter();
const metricExporter = new ConsoleMetricExporter();

const metricReader = new PeriodicExportingMetricReader({ exporter: metricExporter });

const sdk = new NodeSDK({ resource, traceExporter, metricReader });

export const setupInstrumentation = (): void => {
  sdk.start();
  logger.debug("Started OTLP instrumentation");
};
