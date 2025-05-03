import { createConsola } from 'consola'
import process from 'node:process'
/**
 * Default logger instance with standard configuration
 */
export const logger = createConsola({
  level: process.env.LOG_LEVEL === 'debug' ? 5 : 3,
})

/**
 * Creates a named logger for a specific module or component
 * @param name - The name of the module or component
 * @returns A logger instance with the specified name
 */
export function createLogger(name: string) {
  return logger.withTag(name)
}
