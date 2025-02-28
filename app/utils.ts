import { logger } from './logging.ts'

export function isNonEmptyString(str?: string) {
  return typeof str === 'string' && str.trim().length > 0
}

export function safeJsonParse(str: string, errMsg: string) {
  try {
    return JSON.parse(str)
  } catch (_e) {
    logger.warn(errMsg)
    return undefined
  }
}
