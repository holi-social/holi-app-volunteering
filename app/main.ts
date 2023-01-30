import { logger } from "./logging.ts";
import {
  DEFAULT_CACHE_ENABLED,
  DEFAULT_CACHE_TTL_MS_VOLTASTICS,
  DEFAULT_PORT,
  ServerConfig,
  startServer,
} from "./server.ts";

logger.setUpLogger(Deno.env.get("ENVIRONMENT") || "development");

const serverConfigFromEnv = (): ServerConfig => {
  const required = <T>(name: string, t?: T): T => {
    if (!t) {
      throw Error(`Environment variable "${name}" is required`);
    } else {
      return t!;
    }
  };
  const asNumber = (str?: string) => (str ? Number(str) : undefined);
  const asBoolean = (str?: string) => (str ? Boolean(str) : undefined);
  return {
    port: required("PORT", asNumber(Deno.env.get("PORT")) || DEFAULT_PORT),
    cacheEnabled: required(
      "CACHE_ENABLED",
      asBoolean(Deno.env.get("CACHE_ENABLED")) || DEFAULT_CACHE_ENABLED,
    ),
    cacheTtlMsVoltastics: required(
      "DEFAULT_CACHE_TTL_MS_VOLTASTICS",
      asNumber(Deno.env.get("DEFAULT_CACHE_TTL_MS_VOLTASTICS")) ||
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
  };
};

const config = serverConfigFromEnv();
await startServer(config);
