// config/types.ts
export interface BotConfig {
  telegramToken: string

  // Конфигурация Firefly-III
  fireflyConfig?: {
    baseUrl: string
    accessToken: string
    transactionMinTags?: number
  }

  // Конфигурация OpenRouter
  openRouterConfig?: {
    apiKey: string
    model?: string
    baseUrl?: string
    refererUrl?: string
    prompt: string
  }

  adminIds?: string[]
  // Другие настройки
  debug?: boolean
}
