// bot/factory.ts

import type { BotConfig } from '../config/types'
import type { AIServiceClient } from '../services/ai/interfaces'
import type { FinancialServiceClient } from '../services/financial/interfaces'

import { AISDKClient } from '../services/ai/ai-sdk-client'
import { MemoryConversationManager } from '../services/conversation/manager'
import { FireflyFinancialServiceClient } from '../services/financial/firefly-client'
import { FinanceBot } from './finance-bot'

export class FinanceBotFactory {
  static async createBot(config: BotConfig): Promise<FinanceBot> {
    const financialService = this.createFinancialService(config)
    const aiService = this.createAIService(config)
    const conversationManager = new MemoryConversationManager()

    console.log('Все сервисы успешно инициализированы')

    return new FinanceBot(config, financialService, aiService, conversationManager)
  }

  private static createFinancialService(config: BotConfig): FinancialServiceClient {
    if (!config.fireflyConfig) {
      throw new Error('Firefly config is not provided')
    }

    return new FireflyFinancialServiceClient(
      config.fireflyConfig.baseUrl,
      config.fireflyConfig.accessToken,
    )
  }

  private static createAIService(config: BotConfig): AIServiceClient {
    if (!config.openRouterConfig) {
      throw new Error('OpenRouter config is not provided')
    }

    const { apiKey, baseUrl, model, prompt, refererUrl } = config.openRouterConfig

    return new AISDKClient(
      config.fireflyConfig?.transactionMinTags,
      prompt,
      apiKey,
      model,
      baseUrl,
      refererUrl,
    )
  }
}
