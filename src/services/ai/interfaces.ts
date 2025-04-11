// services/ai/interfaces.ts
import type { Buffer } from 'node:buffer'

import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { ConversationMessage } from '../conversation/interfaces'

export interface AIServiceClient {
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
