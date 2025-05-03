/**
 * Conversation status values
 */
export const ConversationStatus = {
  AWAITING_COMMENT: 'awaiting_comment',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  IDLE: 'idle',
  PROCESSING: 'processing',
} as const

/**
 * Type for conversation status
 */
export type ConversationStatusType = typeof ConversationStatus[keyof typeof ConversationStatus]

/**
 * Callback query data values
 */
export const CallbackData = {
  CANCEL: 'cancel',
  CONFIRM: 'confirm',
  NEXT: 'next_refine',
  REFINE: 'refine',
  RETRY: 'retry',
} as const

/**
 * Type for callback query data
 */
export type CallbackDataType = typeof CallbackData[keyof typeof CallbackData]

/**
 * Command values
 */
export const Command = {
  NEXT: 'next',
} as const

/**
 * Type for commands
 */
export type CommandType = typeof Command[keyof typeof Command]
