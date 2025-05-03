// bot/factory.ts

import type { BotConfig } from '../config/types'
import type { AIServiceClient } from '../services/ai/interfaces'
import type { FinancialServiceClient } from '../services/financial/interfaces'

import { TransactionProcessorAIClient } from '../services/ai'
import { MemoryConversationManager } from '../services/conversation/manager'
import { FireflyFinancialService } from '../services/financial/firefly-financial-service'
import { FinanceBot } from './finance-bot'

export class FinanceBotFactory {
  static async createBot(config: BotConfig): Promise<FinanceBot> {
    const financialService = this.createFinancialService(config)
    const aiService = this.createAIService(config)
    const conversationManager = new MemoryConversationManager()

    return new FinanceBot(config, financialService, aiService, conversationManager)
  }

  private static createFinancialService(config: BotConfig): FinancialServiceClient {
    if (!config.fireflyConfig) {
      throw new Error('Firefly config is not provided')
    }

    return new FireflyFinancialService(
      config.fireflyConfig.baseUrl,
      config.fireflyConfig.accessToken,
    )
  }

  private static createAIService(config: BotConfig): AIServiceClient {
    if (!config.openRouterConfig) {
      throw new Error('OpenRouter config is not provided')
    }

    const { apiKey, baseUrl, model, prompt, refererUrl } = config.openRouterConfig

    return new TransactionProcessorAIClient(
      config.fireflyConfig?.transactionMinTags,
      prompt,
      apiKey,
      model,
      baseUrl,
      refererUrl,
    )
  }
}
