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
 * The Logger class requires a setUpLogger method to be run during the app's initialization in order get the current environment.
 */
class Logger {
  environment = "development";

  setUpLogger(environment: string) {
    this.environment = environment;
  }

  /**
   * @param severity Google Cloud's LogSeverity level
   * @param message Log message
   * @param options Any extra fields wanted in the structured logging JSON
   *
   * In a development enviroment, the logs are formatted as simple string for readability purposes.
   * In other environments it should follow Google Cloud's Structured Logging formatting: https://cloud.google.com/logging/docs/structured-logging
   */
  log(severity: LogSeverity, message: string, options = {}) {
    const date = new Date().toISOString();
    const input = this.environment === "development"
      ? `${date} ${severity} ${message}`
      : JSON.stringify({
        environment: this.environment,
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
  }

  debug(message: string, options = {}) {
    this.log(LogSeverity.DEBUG, message, options);
  }

  info(message: string, options = {}) {
    this.log(LogSeverity.INFO, message, options);
  }

  error(message: string, options = {}) {
    this.log(LogSeverity.ERROR, message, options);
  }
}

export const logger = new Logger();
