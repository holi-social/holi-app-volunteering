import { logger, LogSeverity } from "./logging.ts";
import {
  DEFAULT_CACHE_ENABLED,
  DEFAULT_CACHE_TTL_MS_VOLTASTICS,
  DEFAULT_DB_CONNECTION_ATTEMPTS,
  DEFAULT_PORT,
  ServerConfig,
  startServer,
} from "./server.ts";

const environment = Deno.env.get("ENVIRONMENT") || "development";

logger.setUpLogger(
  environment,
  environment === "development" ? LogSeverity.DEFAULT : LogSeverity.INFO,
);

const requiredEnv = <T>(
  name: string,
  typeFn: (s: string) => T,
  fallback?: T,
): T => {
  const env = Deno.env.get(name);
  if (env === undefined && fallback === undefined) {
    throw Error(`Environment variable "${name}" is required`);
  } else {
    return env !== undefined ? typeFn(env) : fallback!;
  }
};

const asBoolean = (str: string) => /^true$/i.test(str);

const fake = requiredEnv("FAKE", asBoolean, false); // For local development. If set, the API returns dummy data
const serverConfigFromEnv = (): ServerConfig => {
  return {
    port: requiredEnv("PORT", Number, DEFAULT_PORT),
    cacheEnabled: requiredEnv(
      "CACHE_ENABLED",
      asBoolean,
      DEFAULT_CACHE_ENABLED,
    ),
    cacheTtlMsVoltastics: requiredEnv(
      "DEFAULT_CACHE_TTL_MS_VOLTASTICS",
      Number,
      DEFAULT_CACHE_TTL_MS_VOLTASTICS,
    ),
    voltastics: {
      baseUrl: requiredEnv(
        "VOLUNTEERING_VOLTASTICS_API_URL",
        String,
        fake ? "dummy value" : undefined,
      ),
      apiToken: requiredEnv(
        "VOLUNTEERING_VOLTASTICS_API_KEY",
        String,
        fake ? "dummy value" : undefined,
      ),
    },
    imageProxyBaseUrl: requiredEnv(
      "IMAGE_PROXY_BASE_URL",
      String,
      environment === "production"
        ? "https://images.holi.social"
        : "https://dev-images.holi.social",
    ),
    volunteeringDB: {
      hostname: requiredEnv("DB_HOST", String),
      port: requiredEnv("DB_PORT", String),
      database: requiredEnv("DB_NAME", String),
      username: requiredEnv("DB_USERNAME", String),
      password: requiredEnv("DB_PASSWORD", String),
      connectionAttempts: requiredEnv(
        "DB_CONNECTION_ATTEMPTS",
        Number,
        DEFAULT_DB_CONNECTION_ATTEMPTS,
      ),
    },
    fake,
  };
};

const config = serverConfigFromEnv();
await startServer(config);
