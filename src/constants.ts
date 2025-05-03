import { CallbackData, Command, ConversationStatus } from './constants/types'

// Re-export from types
export const STATUS_MAP = ConversationStatus

// Callback query data values
export const CALLBACK_DATA_CONFIRM = CallbackData.CONFIRM
export const CALLBACK_DATA_REFINE = CallbackData.REFINE
export const CALLBACK_DATA_CANCEL = CallbackData.CANCEL
export const CALLBACK_DATA_RETRY = CallbackData.RETRY
export const CALLBACK_DATA_NEXT = CallbackData.NEXT

// Commands
export const COMMAND_NEXT = Command.NEXT

// Time intervals
export const CONVERSATION_CLEANUP_INTERVAL_MS = 1000 * 60 * 15 // 15 minutes

// Application constants
export const MAX_PROCESSING_ATTEMPTS = 3

// AI Service defaults
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_REFERER_URL = 'https://finance-bot.app'
export const DEFAULT_MODEL = 'google/gemini-2.5-flash-preview'

// File paths
export const PROMPT_TEMPLATE_FILE = 'prompt.template'

// Template variables
export const VARIABLES = {
  BUDGET_INFO: '{{budgetInfo}}',
  CATEGORIES: '{{categories}}',
  MIN_TAGS: '{{minTags}}',
  TAGS: '{{tags}}',
}
