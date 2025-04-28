export const STATUS_MAP = {
  AWAITING_COMMENT: 'awaiting_comment',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  IDLE: 'idle',
  PROCESSING: 'processing',
} as const

export const CONVERSATION_CLEANUP_INTERVAL_MS = 1000 * 60 * 15 // 15 minutes

export const MAX_PROCESSING_ATTEMPTS = 3
export const COMMAND_NEXT = 'next'

export const CALLBACK_DATA_CONFIRM = 'confirm'
export const CALLBACK_DATA_REFINE = 'refine'
export const CALLBACK_DATA_CANCEL = 'cancel'
export const CALLBACK_DATA_RETRY = 'retry'
export const CALLBACK_DATA_NEXT = 'next_refine'

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_REFERER_URL = 'https://finance-bot.app'
export const DEFAULT_MODEL = 'google/gemini-2.5-flash-preview'

export const PROMPT_TEMPLATE_FILE = 'prompt.template'

export const VARIABLES = {
  BUDGET_INFO: '{{budgetInfo}}',
  CATEGORIES: '{{categories}}',
  MIN_TAGS: '{{minTags}}',
  TAGS: '{{tags}}',
}
