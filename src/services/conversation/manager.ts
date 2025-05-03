import type { Buffer } from 'node:buffer'

import type { Transaction } from '../../domain/types'
import type { ConversationManager, ConversationMessage, ConversationState } from './interfaces'

import { ConversationStatus } from '../../constants/types'
import { createLogger } from '../../utils/logger'

const logger = createLogger('ConversationManager')

export class MemoryConversationManager implements ConversationManager {
  private conversations = new Map<string, ConversationState>()

  getOrCreateConversation(userId: string): ConversationState {
    if (!this.conversations.has(userId)) {
      logger.debug(`Creating new conversation for user ${userId}`)
      this.conversations.set(userId, {
        lastUpdated: new Date(),
        messages: [],
        processingAttempts: 0,
        status: ConversationStatus.IDLE,
        userId,
      })
    }

    return this.conversations.get(userId)!
  }

  resetConversation(userId: string, keepImage = false): void {
    const oldConversation = this.conversations.get(userId)
    const currentImages = keepImage && oldConversation && oldConversation.currentImages
      ? [...oldConversation.currentImages]
      : []

    logger.debug(`Resetting conversation for user ${userId}`, { keepImage })

    this.conversations.set(userId, {
      currentImages,
      lastUpdated: new Date(),
      messages: [],
      processingAttempts: 0,
      status: ConversationStatus.IDLE,
      userId,
    })
  }

  saveImageKeepContext(userId: string, image: Buffer): void {
    const conversation = this.getOrCreateConversation(userId)
    if (!conversation.currentImages) {
      conversation.currentImages = []
    }
    conversation.currentImages.push(image)
    conversation.lastUpdated = new Date()

    logger.debug(`Saved image for user ${userId}, keeping context`, {
      imageCount: conversation.currentImages.length,
    })
  }

  clearTransactionsKeepContext(userId: string): void {
    const conversation = this.getOrCreateConversation(userId)
    conversation.currentTransactions = undefined
    conversation.lastUpdated = new Date()

    logger.debug(`Cleared transactions for user ${userId}, keeping context`)
  }

  clearTransactionKeepContext(userId: string): void {
    this.clearTransactionsKeepContext(userId)
  }

  transitionToRefinement(userId: string): void {
    const conversation = this.getOrCreateConversation(userId)

    if (conversation.status === ConversationStatus.AWAITING_CONFIRMATION) {
      logger.debug(`Transitioning conversation to refinement for user ${userId}`)
      conversation.status = ConversationStatus.AWAITING_COMMENT
      conversation.lastUpdated = new Date()
    }
  }

  addUserMessage(userId: string, content: string, hasImage = false, imageIndex?: number): void {
    const conversation = this.getOrCreateConversation(userId)

    conversation.messages.push({
      content,
      hasImage,
      imageIndex,
      role: 'user',
      timestamp: new Date(),
    })

    conversation.lastUpdated = new Date()
    logger.debug(`Added user message for ${userId}`, { hasImage, imageIndex })
  }

  addAssistantMessage(userId: string, content: string): void {
    const conversation = this.getOrCreateConversation(userId)

    conversation.messages.push({
      content,
      role: 'assistant',
      timestamp: new Date(),
    })

    conversation.lastUpdated = new Date()
    logger.debug(`Added assistant message for ${userId}`)
  }

  updateStatus(userId: string, status: ConversationState['status']): void {
    const conversation = this.getOrCreateConversation(userId)
    const oldStatus = conversation.status
    conversation.status = status
    conversation.lastUpdated = new Date()

    logger.debug(`Updated status for user ${userId}`, {
      from: oldStatus,
      to: status,
    })
  }

  saveImage(userId: string, image: Buffer): void {
    const conversation = this.getOrCreateConversation(userId)
    if (!conversation.currentImages) {
      conversation.currentImages = []
    }
    conversation.currentImages.push(image)
    conversation.lastUpdated = new Date()

    logger.debug(`Saved image for user ${userId}`, {
      imageCount: conversation.currentImages.length,
    })
  }

  saveTransactions(userId: string, transactions: Transaction | Transaction[]): void {
    const conversation = this.getOrCreateConversation(userId)
    const transactionsArray = Array.isArray(transactions) ? transactions : [transactions]
    conversation.currentTransactions = transactionsArray
    conversation.lastUpdated = new Date()

    logger.debug(`Saved ${transactionsArray.length} transactions for user ${userId}`)
  }

  saveTransaction(userId: string, transaction: Transaction): void {
    this.saveTransactions(userId, [transaction])
  }

  getMessagesForAI(userId: string): ConversationMessage[] {
    const conversation = this.getOrCreateConversation(userId)

    return conversation.messages
  }

  incrementProcessingAttempts(userId: string): number {
    const conversation = this.getOrCreateConversation(userId)
    conversation.processingAttempts += 1

    logger.debug(`Incremented processing attempts for user ${userId}`, {
      count: conversation.processingAttempts,
    })

    return conversation.processingAttempts
  }

  cleanupOldConversations(maxAgeHours = 24): void {
    const now = new Date()
    let cleanedCount = 0

    for (const [userId, conversation] of this.conversations.entries()) {
      const ageHours = (now.getTime() - conversation.lastUpdated.getTime()) / (1000 * 60 * 60)
      if (ageHours > maxAgeHours) {
        this.conversations.delete(userId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old conversations`, {
        maxAgeHours,
        remainingCount: this.conversations.size,
      })
    }
  }

  getCurrentImageForProcessing(userId: string, imageIndex = 0): Buffer | undefined {
    const conversation = this.getOrCreateConversation(userId)
    if (!conversation.currentImages || conversation.currentImages.length === 0) {
      return undefined
    }

    return imageIndex < conversation.currentImages.length
      ? conversation.currentImages[imageIndex]
      : conversation.currentImages[0]
  }

  clearOldImages(userId: string, keepCount = 1): void {
    const conversation = this.getOrCreateConversation(userId)

    if (conversation.currentImages && conversation.currentImages.length > keepCount) {
      const oldCount = conversation.currentImages.length
      conversation.currentImages = conversation.currentImages.slice(-keepCount)

      logger.debug(`Cleared old images for user ${userId}`, {
        kept: conversation.currentImages.length,
        removed: oldCount - conversation.currentImages.length,
      })
    }
  }

  setLastError(userId: string, errorMessage: string): void {
    const conversation = this.getOrCreateConversation(userId)
    conversation.lastError = errorMessage
    conversation.lastUpdated = new Date()

    logger.debug(`Set error for user ${userId}`, { errorMessage })
  }

  getLastError(userId: string): string | undefined {
    const conversation = this.getOrCreateConversation(userId)

    return conversation.lastError
  }
}
