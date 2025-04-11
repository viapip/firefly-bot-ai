// services/conversation/memory-conversation.ts
import type { Buffer } from 'node:buffer'

import type { Transaction } from '../../domain/types'
import type { ConversationManager, ConversationMessage, ConversationState } from './interfaces'

export class MemoryConversationManager implements ConversationManager {
  private conversations = new Map<string, ConversationState>()

  getOrCreateConversation(userId: string): ConversationState {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, {
        lastUpdated: new Date(),
        messages: [],
        processingAttempts: 0,
        status: 'idle',
        userId,
      })
    }

    return this.conversations.get(userId)!
  }

  /**
   * Сбрасывает состояние диалога, с опцией сохранения текущего изображения
   */
  resetConversation(userId: string, keepImage = false): void {
    const oldConversation = this.conversations.get(userId)
    // Сохраняем текущие изображения, если указан флаг keepImage
    // Если нужно сохранить изображения, берем их из старого состояния
    // В противном случае создаем пустой массив для новых изображений
    const currentImages = keepImage && oldConversation && oldConversation.currentImages
      ? [...oldConversation.currentImages]
      : []

    this.conversations.set(userId, {
      currentImages, // Всегда инициализируем массив изображений
      lastUpdated: new Date(),
      messages: [],
      processingAttempts: 0,
      status: 'idle',
      userId,
    })
  }

  /**
   * Сохраняет изображение, сохраняя текущий контекст (историю сообщений)
   */
  saveImageKeepContext(userId: string, image: Buffer): void {
    const conversation = this.getOrCreateConversation(userId)
    // Инициализируем массив изображений, если его еще нет
    if (!conversation.currentImages) {
      conversation.currentImages = []
    }
    conversation.currentImages.push(image)
    conversation.lastUpdated = new Date()
    // Не сбрасываем сообщения или другие данные контекста
  }

  /**
   * Очищает текущие транзакции, сохраняя изображение и контекст
   */
  clearTransactionsKeepContext(userId: string): void {
    const conversation = this.getOrCreateConversation(userId)
    conversation.currentTransactions = undefined
    conversation.lastUpdated = new Date()
  }

  /**
   * Метод для обратной совместимости
   * @deprecated Используйте clearTransactionsKeepContext
   */
  clearTransactionKeepContext(userId: string): void {
    this.clearTransactionsKeepContext(userId)
  }

  /**
   * Переводит диалог из состояния ожидания подтверждения в режим уточнения
   */
  transitionToRefinement(userId: string): void {
    const conversation = this.getOrCreateConversation(userId)

    if (conversation.status === 'awaiting_confirmation') {
      conversation.status = 'awaiting_comment'
      conversation.lastUpdated = new Date()
    }
  }

  addUserMessage(userId: string, content: string, hasImage = false, imageIndex?: number): void {
    const conversation = this.getOrCreateConversation(userId)

    conversation.messages.push({
      content,
      hasImage,
      imageIndex, // Сохраняем индекс изображения, если оно есть
      role: 'user',
      timestamp: new Date(),
    })

    conversation.lastUpdated = new Date()
  }

  addAssistantMessage(userId: string, content: string): void {
    const conversation = this.getOrCreateConversation(userId)

    conversation.messages.push({
      content,
      role: 'assistant',
      timestamp: new Date(),
    })

    conversation.lastUpdated = new Date()
  }

  updateStatus(userId: string, status: ConversationState['status']): void {
    const conversation = this.getOrCreateConversation(userId)
    conversation.status = status
    conversation.lastUpdated = new Date()
  }

  saveImage(userId: string, image: Buffer): void {
    const conversation = this.getOrCreateConversation(userId)
    // Инициализируем массив изображений, если его еще нет
    if (!conversation.currentImages) {
      conversation.currentImages = []
    }
    conversation.currentImages.push(image)
    conversation.lastUpdated = new Date()
  }

  saveTransactions(userId: string, transactions: Transaction | Transaction[]): void {
    const conversation = this.getOrCreateConversation(userId)
    // Преобразуем в массив, если пришла одна транзакция
    const transactionsArray = Array.isArray(transactions) ? transactions : [transactions]
    conversation.currentTransactions = transactionsArray
    conversation.lastUpdated = new Date()
  }

  /**
   * Сохраняет одиночную транзакцию (метод для обратной совместимости)
   * В новом коде следует использовать saveTransactions
   */
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

    return conversation.processingAttempts
  }

  cleanupOldConversations(maxAgeHours = 24): void {
    const now = new Date()
    for (const [userId, conversation] of this.conversations.entries()) {
      const ageHours = (now.getTime() - conversation.lastUpdated.getTime()) / (1000 * 60 * 60)
      if (ageHours > maxAgeHours) {
        this.conversations.delete(userId)
      }
    }
  }

  getCurrentImageForProcessing(userId: string, imageIndex = 0): Buffer | undefined {
    const conversation = this.getOrCreateConversation(userId)
    // Возвращаем изображение по указанному индексу или первое, если индекс не указан
    // Если индекс выходит за пределы массива или массив пуст, возвращаем undefined
    if (!conversation.currentImages || conversation.currentImages.length === 0) {
      return undefined
    }

    // Проверяем, что индекс в пределах массива
    return imageIndex < conversation.currentImages.length
      ? conversation.currentImages[imageIndex]
      : conversation.currentImages[0] // Если индекс некорректный, возвращаем первое изображение
  }

  /**
   * Очищает старые изображения, оставляя только указанное количество последних
   */
  clearOldImages(userId: string, keepCount = 1): void {
    const conversation = this.getOrCreateConversation(userId)

    if (conversation.currentImages && conversation.currentImages.length > keepCount) {
      // Оставляем только последние keepCount изображений
      conversation.currentImages = conversation.currentImages.slice(-keepCount)
    }
  }

  /**
   * Сохраняет сообщение об ошибке в состоянии диалога
   */
  setLastError(userId: string, errorMessage: string): void {
    const conversation = this.getOrCreateConversation(userId)
    conversation.lastError = errorMessage
    conversation.lastUpdated = new Date()
  }

  /**
   * Возвращает последнее сообщение об ошибке
   */
  getLastError(userId: string): string | undefined {
    const conversation = this.getOrCreateConversation(userId)

    return conversation.lastError
  }
}
