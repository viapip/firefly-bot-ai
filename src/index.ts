import dotenv from 'dotenv'
import path from 'node:path'
import process from 'node:process'

import type { BotConfig } from './config/types'

import { FinanceBotFactory } from './bot/factory'
import { loadPromptTemplate } from './utils'
import { logger } from './utils/logger'

// Load environment variables
dotenv.config()

// Set log level based on debug flag
if (process.env.DEBUG === 'true') {
  process.env.LOG_LEVEL = 'debug'
}

/**
 * Main function to start the bot
 */
async function startBot() {
  logger.info('Starting Firefly Finance Bot')

  // Load configuration from environment variables
  const config: BotConfig = {
    telegramToken: process.env.TELEGRAM_TOKEN || '',

    // Firefly III configuration (if present)
    fireflyConfig: process.env.FIREFLY_API_URL
      ? {
          accessToken: process.env.FIREFLY_ACCESS_TOKEN || '',
          baseUrl: process.env.FIREFLY_API_URL,
          transactionMinTags: process.env.FIREFLY_MIN_TAGS
            ? Number.parseInt(process.env.FIREFLY_MIN_TAGS, 10)
            : undefined,
        }
      : undefined,

    // OpenRouter configuration (if present)
    openRouterConfig: process.env.OPENROUTER_API_KEY
      ? {
          apiKey: process.env.OPENROUTER_API_KEY,
          baseUrl: process.env.OPENROUTER_BASE_URL,
          model: process.env.OPENROUTER_MODEL,
          prompt: process.env.OPENROUTER_PROMPT || '',
          refererUrl: process.env.OPENROUTER_REFERER_URL,
        }
      : undefined,

    adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
    // Other settings
    debug: process.env.DEBUG === 'true',
  }

  logger.debug('Configuration loaded', {
    debug: config.debug,
    hasFireflyConfig: Boolean(config.fireflyConfig),
    hasOpenRouterConfig: Boolean(config.openRouterConfig),
  })

  // Validate required parameters
  if (!config.telegramToken) {
    logger.fatal('Error: Telegram bot token is not provided')
    process.exit(1)
  }

  // Validate AI service configuration
  if (!config.openRouterConfig || !config.openRouterConfig.apiKey) {
    logger.fatal('Error: AI service parameters (OpenRouter) are not provided')
    process.exit(1)
  }

  // Validate financial service configuration
  if (
    !config.fireflyConfig
    || !config.fireflyConfig.baseUrl
    || !config.fireflyConfig.accessToken
  ) {
    logger.fatal('Error: Financial service parameters (Firefly) are not provided')
    process.exit(1)
  }

  // Load prompt template
  const projectRoot = path.resolve(process.cwd())
  const promptTemplate = loadPromptTemplate(projectRoot) || config.openRouterConfig.prompt || ''

  if (!promptTemplate) {
    logger.warn('No prompt template found, using empty prompt')
  }
  else {
    logger.debug('Prompt template loaded')
  }

  config.openRouterConfig.prompt = promptTemplate

  // Create and start bot
  try {
    logger.info('Creating bot and checking services...')

    const bot = await FinanceBotFactory.createBot(config)
    bot.start()

    logger.info('Bot successfully started')

    // Handle process termination
    const handleExit = () => {
      logger.info('Received termination signal, stopping bot')
      bot.stop()
      process.exit(0)
    }

    process.on('SIGINT', handleExit)
    process.on('SIGTERM', handleExit)
  }
  catch (error) {
    logger.fatal('Error starting the bot:', error)
    process.exit(1)
  }
}

// Start the bot
startBot()
  .catch((error) => {
    logger.fatal('Unhandled error during bot startup:', error)
    process.exit(1)
  })
