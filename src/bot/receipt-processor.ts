import type { Buffer } from 'node:buffer'

import type { Transaction } from '../domain/types'
import type { AIServiceClient } from '../services/ai/interfaces'
import type { ConversationManager } from '../services/conversation/interfaces'
import type { FinancialServiceClient } from '../services/financial/interfaces'

import { ConversationStatus } from '../constants/types'
import { createLogger } from '../utils/logger'

const logger = createLogger('ReceiptProcessor')

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
    logger.debug('ReceiptProcessor initialized')
  }

  public async processReceipt(userId: string, images: Buffer[]): Promise<Transaction[]> {
    if (!images || images.length === 0) {
      const error = new Error('No images provided for processing')
      logger.error(`Failed to process receipt for user ${userId}:`, error)
      throw error
    }

    logger.info(`Processing receipt for user ${userId} with ${images.length} images`)

    try {
      // Fetch required data from financial service
      const [
        categories,
        tags,
        budgetLimits,
      ] = await this.fetchFinancialData(userId)

      // Get conversation messages for context
      const messages = this.conversationManager.getMessagesForAI(userId)
      logger.debug(`Retrieved ${messages.length} messages for user ${userId}`)

      // Process receipt with AI
      const aiResult = await this.processWithAI(userId, images, messages, categories, tags, budgetLimits)

      // Convert to array and save results
      const transactions = Array.isArray(aiResult) ? aiResult : [aiResult]
      logger.info(`Generated ${transactions.length} transactions for user ${userId}`)

      // Save result and update status
      this.conversationManager.saveTransactions(userId, transactions)
      this.conversationManager.updateStatus(userId, ConversationStatus.AWAITING_CONFIRMATION)

      return transactions
    }
    catch (error) {
      this.handleProcessingError(userId, error)
      throw error
    }
  }

  private async fetchFinancialData(userId: string) {
    try {
      logger.debug(`Fetching financial data for user ${userId}`)

      const results = await Promise.all([
        this.financialService.getCategories(),
        this.financialService.getTags(),
        this.financialService.getBudgetLimits(),
        this.financialService.fetchAndSetDefaultAccount(),
      ])

      logger.debug(`Retrieved financial data: ${results[0].length} categories, ${results[1].length} tags, ${results[2].length} budget limits`)

      return results.slice(0, 3) as [typeof results[0], typeof results[1], typeof results[2]]
    }
    catch (error) {
      logger.error(`Failed to fetch financial data for user ${userId}:`, error)
      throw new Error(`Failed to fetch required data from financial service: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async processWithAI(
    userId: string,
    images: Buffer[],
    messages: ReturnType<ConversationManager['getMessagesForAI']>,
    categories: Awaited<ReturnType<FinancialServiceClient['getCategories']>>,
    tags: Awaited<ReturnType<FinancialServiceClient['getTags']>>,
    budgetLimits: Awaited<ReturnType<FinancialServiceClient['getBudgetLimits']>>,
  ) {
    try {
      logger.debug(`Sending receipt to AI for processing: user ${userId}, ${images.length} images`)

      return await this.aiService.processReceiptAndComments(
        images,
        messages,
        categories,
        tags,
        budgetLimits,
      )
    }
    catch (error) {
      logger.error(`AI processing failed for user ${userId}:`, error)
      // Simply pass through the original error
      throw error
    }
  }

  private handleProcessingError(userId: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Receipt processing error for user ${userId}:`, error)

    // Store the error message in the conversation state
    this.conversationManager.setLastError(userId, errorMessage)
  }
}
