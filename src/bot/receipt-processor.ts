// bot/receipt-processor.ts
import type { Buffer } from 'node:buffer'

import type { Transaction } from '../domain/types'
import type { AIServiceClient } from '../services/ai/interfaces'
import type { ConversationManager } from '../services/conversation/interfaces'
import type { FinancialServiceClient } from '../services/financial/interfaces'

const STATUS_MAP = {
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
} as const

export class ReceiptProcessor {
  private aiService: AIServiceClient
  private conversationManager: ConversationManager
  private financialService: FinancialServiceClient

  constructor(
    aiService: AIServiceClient,
    financialService: FinancialServiceClient,
    conversationManager: ConversationManager,
  ) {
    this.aiService = aiService
    this.financialService = financialService
    this.conversationManager = conversationManager
  }

  public async processReceipt(userId: string, images: Buffer[]): Promise<Transaction[]> {
    const [
      categories,
      tags,
      budgetLimits,
    ] = await Promise.all([
      this.financialService.getCategories(),
      this.financialService.getTags(),
      this.financialService.getBudgetLimits(),
      this.financialService.fetchAndSetDefaultAccount(),
    ])

    const messages = this.conversationManager.getMessagesForAI(userId)

    const aiResult = await this.aiService.processReceiptAndComments(
      images,
      messages,
      categories,
      tags,
      budgetLimits,
    )

    const transactions = Array.isArray(aiResult) ? aiResult : [aiResult]

    // Save result and update status
    this.conversationManager.saveTransactions(userId, transactions)
    this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)

    return transactions
  }
}
