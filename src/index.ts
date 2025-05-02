import dotenv from 'dotenv'
import path from 'node:path'
import process from 'node:process'

import type { BotConfig } from './config/types'

import { FinanceBotFactory } from './bot/factory'
import { loadPromptTemplate } from './utils'

// Загружаем переменные окружения
dotenv.config()

// Функция для запуска бота
async function startBot() {
  // Загрузка конфигурации из переменных окружения
  const config: BotConfig = {
    telegramToken: process.env.TELEGRAM_TOKEN || '',

    // Конфигурация Firefly-III (если есть)
    fireflyConfig: process.env.FIREFLY_API_URL
      ? {
          accessToken: process.env.FIREFLY_ACCESS_TOKEN || '',
          baseUrl: process.env.FIREFLY_API_URL,
        }
      : undefined,

    // Конфигурация OpenRouter (если есть)
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
    // Другие настройки
    debug: process.env.DEBUG === 'true',
  }

  // Проверка обязательных параметров
  if (!config.telegramToken) {
    console.error('Ошибка: Не указан токен Telegram бота')
    process.exit(1)
  }

  // Проверка наличия конфигурации для AI и финансового сервисов
  if (!config.openRouterConfig || !config.openRouterConfig.apiKey) {
    console.error('Ошибка: Не указаны параметры для AI сервиса (OpenRouter)')
    process.exit(1)
  }

  if (
    !config.fireflyConfig
    || !config.fireflyConfig.baseUrl
    || !config.fireflyConfig.accessToken
  ) {
    console.error(
      'Ошибка: Не указаны параметры для финансового сервиса (Firefly)',
    )
    process.exit(1)
  }

  // Определение корня проекта и загрузка шаблона промпта
  const projectRoot = path.resolve(process.cwd())
  const promptTemplate
    = loadPromptTemplate(projectRoot) || config.openRouterConfig.prompt || ''

  config.openRouterConfig.prompt = promptTemplate

  // Создание и запуск бота
  try {
    console.log('Создание бота и проверка сервисов...')

    const bot = await FinanceBotFactory.createBot(config)
    bot.start()

    console.log('Бот успешно запущен')

    // Обработка остановки процесса
    const handleExit = () => {
      bot.stop()
      process.exit(0)
    }

    process.on('SIGINT', handleExit)
    process.on('SIGTERM', handleExit)
  }
  catch (error) {
    console.error('Ошибка запуска бота:', error)
    process.exit(1)
  }
}

// Запуск бота
startBot()
  .catch(console.error)
