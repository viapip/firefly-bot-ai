import type { LanguageModelV1 } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createLogger } from '../../utils/logger'
import { DEFAULT_MODEL, DEFAULT_OPENROUTER_BASE_URL, DEFAULT_REFERER_URL } from '../../constants'
import type { BaseAIService } from './interfaces'

const logger = createLogger('BaseAIClient')

/**
 * Base AI client class for low-level API communication
 * Handles initialization and common API operations
 */
export class BaseAIClient implements BaseAIService {
  protected openAI: LanguageModelV1

  /**
   * Initialize the base AI client
   * @param apiKey - API key for the AI service
   * @param model - Model name to use
   * @param baseUrl - Base URL for the AI service
   * @param refererUrl - Referer URL for the API requests
   */
  constructor(
    protected apiKey: string,
    protected model = DEFAULT_MODEL,
    protected baseUrl = DEFAULT_OPENROUTER_BASE_URL,
    protected refererUrl = DEFAULT_REFERER_URL,
  ) {
    try {
      logger.debug('Initializing Base AI client', {
        baseUrl,
        model,
      })

      this.openAI = createOpenAI({
        apiKey,
        baseURL: baseUrl,
        compatibility: 'strict',
        headers: {
          'HTTP-Referer': refererUrl,
        },
      })(model, {
        parallelToolCalls: false,
        reasoningEffort: 'medium',
      })

      logger.info('Base AI client initialized successfully')
    }
    catch (error) {
      logger.error('Error initializing Base AI client:', error)
      throw new Error(`Failed to initialize Base AI client: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Gets the current model instance
   * @returns The language model instance
   */
  protected getModel(): LanguageModelV1 {
    return this.openAI
  }
  
  /**
   * Gets the current model name
   * @returns The model name
   */
  getModelName(): string {
    return this.model
  }
}