// services/ai/interfaces.ts
import type { Buffer } from 'node:buffer'

import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { ConversationMessage } from '../conversation/interfaces'
import type { AnalyticsAIClient } from './analytics-ai-client'

/**
 * Base interface for AI API operations
 */
export interface BaseAIService {
  /**
   * Gets the current model name
   */
  getModelName?: () => string
}

/**
 * Interface for transaction processing with AI
 */
export interface AIServiceClient extends BaseAIService {
  /**
   * Обрабатывает чек и комментарии пользователя для создания одной или нескольких транзакций
   * Может вернуть массив транзакций, если в чеке определены товары из разных категорий
   */
  processReceiptAndComments: (
    imageBuffers: Buffer[],
    messages: ConversationMessage[],
    categories: Category[],
    tags?: Tag[],
    budgetLimits?: BudgetLimit[],
  ) => Promise<Transaction | Transaction[]>
}

/**
 * Composite interface that combines transaction processing and analytics
 * For future use when analytics capabilities are implemented
 */
export interface AICompositeService extends AIServiceClient, AnalyticsAIClient {
  // This composite interface combines methods from both parent interfaces
}
