import { logger, LogSeverity } from "./logging.ts";
import {
  DEFAULT_CACHE_ENABLED,
  DEFAULT_CACHE_TTL_MS_VOLTASTICS,
  DEFAULT_PORT,
  ServerConfig,
  startServer,
} from "./server.ts";

const environment = Deno.env.get("ENVIRONMENT") || "development";

logger.setUpLogger(
  environment,
  environment === "development" ? LogSeverity.DEFAULT : LogSeverity.INFO,
);

const required = <T>(name: string, t?: T, fallback?: T): T => {
  if (t === undefined && fallback === undefined) {
    throw Error(`Environment variable "${name}" is required`);
  } else {
    return t !== undefined ? t : fallback!;
  }
};
const asNumber = (str?: string) => (str ? Number(str) : undefined);
const asBoolean = (str?: string) => (str ? /^true$/i.test(str) : undefined);

const serverConfigFromEnv = (): ServerConfig => {
  return {
    port: required("PORT", asNumber(Deno.env.get("PORT")) || DEFAULT_PORT),
    cacheEnabled: required(
      "CACHE_ENABLED",
      asBoolean(Deno.env.get("CACHE_ENABLED")),
      DEFAULT_CACHE_ENABLED,
    ),
    cacheTtlMsVoltastics: required(
      "DEFAULT_CACHE_TTL_MS_VOLTASTICS",
      asNumber(Deno.env.get("DEFAULT_CACHE_TTL_MS_VOLTASTICS")),
      DEFAULT_CACHE_TTL_MS_VOLTASTICS,
    ),
    voltastics: {
      baseUrl: required(
        "VOLUNTEERING_VOLTASTICS_API_URL",
        Deno.env.get("VOLUNTEERING_VOLTASTICS_API_URL"),
      ),
      apiToken: required(
        "VOLUNTEERING_VOLTASTICS_API_KEY",
        Deno.env.get("VOLUNTEERING_VOLTASTICS_API_KEY"),
      ),
    },
    imageProxyBaseUrl: Deno.env.get("IMAGE_PROXY_BASE_URL") ||
      (environment === "production"
        ? "https://images.holi.social"
        : "https://dev-images.holi.social"),
  };
};

const config = serverConfigFromEnv();
await startServer(config);
