import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ConsoleMetricExporter,
  ConsoleSpanExporter,
  NodeSDK,
  opentelemetry,
  OTLPMetricExporter,
  OTLPTraceExporter,
  PeriodicExportingMetricReader,
  Resource,
} from "./deps.ts";
import { logger } from "./logging.ts";
import { environmentFromEnv } from "./environment.ts";
import { requiredEnv } from "./config.ts";

export type OTLPExporterConfig = {
  environment: "production" | "staging" | "review";
  url: string;
  version: string;
};

export type DevelopmentConfig = {
  environment: "development";
};

export type InstrumentationConfig = OTLPExporterConfig | DevelopmentConfig;

export const instrumentationConfigFromEnv = (): InstrumentationConfig => {
  const environment = environmentFromEnv();
  if (environment == "development") {
    return {
      environment,
    };
  } else {
    return {
      environment,
      url: requiredEnv("OTEL_EXPORTER_OTLP_ENDPOINT", String),
      version: requiredEnv("K_REVISION", String), // see https://cloud.google.com/run/docs/container-contract#services-env-vars
    };
  }
};

export const timed = async <T>(meter: opentelemetry.Meter, name: string, fn: () => Promise<T>): Promise<T> => {
  const histogram = meter.createHistogram(name);
  const before = new Date().getTime();
  try {
    return await fn();
  } finally {
    const duration = new Date().getTime() - before;
    logger.debug(`[${duration.toString().padStart(4, " ")} ms] ${name}`);
    histogram.record(duration);
  }
};

export const setupInstrumentation = (config: InstrumentationConfig): opentelemetry.Meter => {
  logger.debug(`Starting OTLP instrumentation with config=${JSON.stringify(config)}`);
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: "holi-app-volunteering",
    [ATTR_SERVICE_VERSION]: config.environment !== "development" ? config.version : undefined,
  });
  const traceExporter = config.environment === "development"
    ? new ConsoleSpanExporter()
    : new OTLPTraceExporter({ url: config.url });
  const metricExporter = config.environment === "development"
    ? new ConsoleMetricExporter()
    : new OTLPMetricExporter({ url: config.url });
  const metricReader = new PeriodicExportingMetricReader({ exporter: metricExporter });
  const sdk = new NodeSDK({ resource, traceExporter, metricReader });
  sdk.start();
  return opentelemetry.metrics.getMeter(
    "holi-app-volunteering",
    config.environment !== "development" ? config.version : undefined,
  );
};
