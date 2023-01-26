const environment = Deno.env.get("ENVIRONMENT") || "development";

// Google Cloud LogSeverity levels https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
export enum LogSeverity {
  DEFAULT = "DEFAULT",
  DEBUG = "DEBUG",
  INFO = "INFO",
  NOTICE = "NOTICE",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
  ALERT = "ALERT",
  EMERGENCY = "EMERGENCY",
}

/**
 * @param severity Google Cloud's LogSeverity level
 * @param message Log message
 * @param options Any extra fields wanted in the structured logging JSON
 *
 * When in development enviroment, the logs are formatted as simple string for readability purposes.
 * In other environments it should follow Google Cloud's Structured Logging formatting: https://cloud.google.com/logging/docs/structured-logging
 */
export const logger = (
  severity: LogSeverity,
  message: string,
  options = {},
) => {
  const date = new Date().toISOString();
  const input = environment === "development"
    ? `${date} ${severity} ${message}`
    : JSON.stringify({
      severity,
      message,
      ...options,
    });

  switch (severity) {
    case LogSeverity.DEFAULT:
      console.log(input);
      break;
    case LogSeverity.DEBUG:
      console.debug(input);
      break;
    case LogSeverity.INFO:
    case LogSeverity.NOTICE:
      console.info(input);
      break;
    case LogSeverity.WARNING:
      console.warn(input);
      break;
    case LogSeverity.ERROR:
    case LogSeverity.CRITICAL:
    case LogSeverity.ALERT:
    case LogSeverity.EMERGENCY:
      console.error(input);
  }
};
