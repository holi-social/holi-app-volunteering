import { log } from "./deps.ts";

// Google Cloud Structured Logging fields https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry
const logName = "holi-app-volunteering";
const resource = {
  type: "cloud_run_revision",
  labels: {
    projectId: "holi-shared",
  },
};

const setupLogging = (environment: string) =>
  log.setup({
    handlers: {
      default: new log.handlers.ConsoleHandler("DEBUG", {
        formatter: ({ datetime, levelName, msg }) =>
          JSON.stringify({
            logName,
            timestamp: datetime.toISOString(),
            severity: levelName,
            message: msg,
            resource,
          }),
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
