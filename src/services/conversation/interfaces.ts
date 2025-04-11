// services/conversation/interfaces.ts
import type { Buffer } from 'node:buffer'

import type { Transaction } from '../../domain/types'

export interface ConversationMessage {
  content: string
  hasImage?: boolean
  imageIndex?: number // Индекс изображения для поддержки нескольких изображений
  role: 'assistant' | 'system' | 'user'
  timestamp: Date
}

export interface ConversationState {
  currentImages?: Buffer[] // Массив для нескольких изображений
  currentTransactions?: Transaction[] // Массив для нескольких транзакций в одном чеке
  lastError?: string // Added to store the last error message
  lastUpdated: Date
  messages: ConversationMessage[]
  processingAttempts: number
  status: 'awaiting_comment' | 'awaiting_confirmation' | 'idle' | 'processing'
  userId: string
}

export interface ConversationManager {
  // Существующие методы
  addAssistantMessage: (userId: string, content: string) => void
  addUserMessage: (userId: string, content: string, hasImage?: boolean, imageIndex?: number) => void
  cleanupOldConversations: (maxAgeHours?: number) => void
  getMessagesForAI: (userId: string) => ConversationMessage[]
  getOrCreateConversation: (userId: string) => ConversationState
  incrementProcessingAttempts: (userId: string) => number
  resetConversation: (userId: string, keepImage?: boolean) => void
  saveImage: (userId: string, image: Buffer) => void
  saveTransactions: (userId: string, transactions: Transaction | Transaction[]) => void
  updateStatus: (userId: string, status: ConversationState['status']) => void

  clearTransactionsKeepContext: (userId: string) => void
  // Новые методы для лучшего управления контекстом
  saveImageKeepContext: (userId: string, image: Buffer) => void
  transitionToRefinement: (userId: string) => void

  // Метод для получения изображения для AI-обработки по его индексу
  getCurrentImageForProcessing: (userId: string, imageIndex?: number) => Buffer | undefined

  // Метод для очистки старых изображений
  clearOldImages: (userId: string, keepCount?: number) => void

  getLastError: (userId: string) => string | undefined
  // Methods to handle error messages
  setLastError: (userId: string, errorMessage: string) => void
}
