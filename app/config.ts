import {
  DEFAULT_CACHE_ENABLED,
  DEFAULT_CACHE_TTL_MS_DB,
  DEFAULT_CACHE_TTL_MS_VOLTASTICS,
  DEFAULT_DB_CONNECTION_ATTEMPTS,
  DEFAULT_PORT,
  ServerConfig,
} from "./server.ts";

export const requiredEnv = <T>(
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

export const environment = Deno.env.get("ENVIRONMENT")?.toLowerCase().trim() || "development";

export const serverConfigFromEnv = (): ServerConfig => {
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
    cacheTtlMsDB: requiredEnv(
      "DEFAULT_CACHE_TTL_MS_DB",
      Number,
      DEFAULT_CACHE_TTL_MS_DB,
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
      environment === "production" ? "https://images.holi.social" : "https://dev-images.holi.social",
    ),
    volunteeringDB: {
      hostname: requiredEnv(
        "DB_HOST",
        String,
        fake ? "dummy value" : undefined,
      ),
      port: requiredEnv("DB_PORT", String, fake ? "31337" : undefined),
      database: requiredEnv(
        "DB_NAME",
        String,
        fake ? "dummy value" : undefined,
      ),
      username: requiredEnv(
        "DB_USERNAME",
        String,
        fake ? "dummy value" : undefined,
      ),
      password: requiredEnv(
        "DB_PASSWORD",
        String,
        fake ? "dummy value" : undefined,
      ),
      connectionAttempts: requiredEnv(
        "DB_CONNECTION_ATTEMPTS",
        Number,
        DEFAULT_DB_CONNECTION_ATTEMPTS,
      ),
    },
    fake,
    geoAPIEndpointUrl: requiredEnv(
      "GEO_API_ENDPOINT_URL",
      String,
      fake ? "dummy value" : undefined,
    ),
  };
};
