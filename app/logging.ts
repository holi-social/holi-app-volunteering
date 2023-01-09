import { log } from "./deps.ts";

const setupLogging = (environment: string) =>
  log.setup({
    handlers: {
      default: new log.handlers.ConsoleHandler("DEBUG", {
        formatter: ({ datetime, levelName, msg }) =>
          `${datetime.toISOString()} ${levelName} ${msg}`,
      }),
    },

    loggers: {
      default: {
        level: environment === "development" ? "DEBUG" : "INFO",
        handlers: ["default"],
      },
    },
  });

export default setupLogging;
