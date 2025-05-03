import type { Buffer } from 'node:buffer'

import type { ConversationStatusType } from '../../constants/types'
import type { Transaction } from '../../domain/types'

export interface ConversationMessage {
  content: string
  hasImage?: boolean
  imageIndex?: number
  role: 'assistant' | 'system' | 'user'
  timestamp: Date
}

export interface ConversationState {
  currentImages?: Buffer[]
  currentTransactions?: Transaction[]
  lastError?: string
  lastUpdated: Date
  messages: ConversationMessage[]
  processingAttempts: number
  status: ConversationStatusType
  userId: string
}

export interface ConversationManager {
  addAssistantMessage: (userId: string, content: string) => void
  addUserMessage: (userId: string, content: string, hasImage?: boolean, imageIndex?: number) => void
  cleanupOldConversations: (maxAgeHours?: number) => void
  getMessagesForAI: (userId: string) => ConversationMessage[]
  getOrCreateConversation: (userId: string) => ConversationState
  incrementProcessingAttempts: (userId: string) => number
  resetConversation: (userId: string, keepImage?: boolean) => void
  saveImage: (userId: string, image: Buffer) => void
  saveTransactions: (userId: string, transactions: Transaction | Transaction[]) => void
  updateStatus: (userId: string, status: ConversationStatusType) => void

  clearTransactionsKeepContext: (userId: string) => void
  saveImageKeepContext: (userId: string, image: Buffer) => void
  transitionToRefinement: (userId: string) => void

  clearOldImages: (userId: string, keepCount?: number) => void
  getCurrentImageForProcessing: (userId: string, imageIndex?: number) => Buffer | undefined

  getLastError: (userId: string) => string | undefined
  setLastError: (userId: string, errorMessage: string) => void
}
