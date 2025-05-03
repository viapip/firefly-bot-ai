import type { CoreMessage, CoreUserMessage, LanguageModelV1 } from 'ai'
import type { Buffer } from 'node:buffer'
import type { z } from 'zod'

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'

import type { BudgetLimit, Category, Tag, Transaction } from '../../domain/types'
import type { ConversationMessage } from '../conversation/interfaces'
import type { AIServiceClient } from './interfaces'
import type { createTransactionSchema } from './schemas'

import { DEFAULT_MODEL, DEFAULT_OPENROUTER_BASE_URL, DEFAULT_REFERER_URL, VARIABLES } from '../../constants'
import { createLogger } from '../../utils/logger'
import { createMultipleTransactionsSchema, createSingleTransactionSchema } from './schemas'

const logger = createLogger('AIService')

/**
 * AI service client implementation using AI SDK
 */
export class AISDKClient implements AIServiceClient {
  private openAI: LanguageModelV1

  /**
   * Initialize the AI client
   * @param transactionMinTags - Minimum number of tags required for transactions
   * @param prompt - System prompt template to use
   * @param apiKey - API key for the AI service
   * @param model - Model name to use
   * @param baseUrl - Base URL for the AI service
   * @param refererUrl - Referer URL for the API requests
   */
  constructor(
    private transactionMinTags = 0,
    private prompt: string,
    apiKey: string,
    model = DEFAULT_MODEL,
    baseUrl = DEFAULT_OPENROUTER_BASE_URL,
    refererUrl = DEFAULT_REFERER_URL,
  ) {
    try {
      logger.debug('Initializing AI service', {
        baseUrl,
        minTags: transactionMinTags,
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

      logger.info('AI service initialized successfully')
    }
    catch (error) {
      logger.error('Error initializing AI service:', error)
      throw new Error(`Failed to initialize AI service: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Parses a date string in 'YYYY-MM-DD HH:mm' format into a Date object.
   */
  private parseTransactionDate(dateString: string): Date {
    // Replace space with 'T' for ISO 8601 format compatibility
    try {
      return new Date(dateString.replace(' ', 'T'))
    }
    catch (error) {
      logger.error(`Error parsing transaction date "${dateString}":`, error)
      // Return current date as fallback

      return new Date()
    }
  }

  /**
   * Finds a category by ID or returns a default category.
   */
  private findCategoryById(categoryId: string, categories: Category[]): Category {
    const category = categories.find((cat) => {
      return cat.id === categoryId
    })

    // Return found category or the first available category, or a default 'unknown' category
    if (!category) {
      logger.warn(`Category with ID "${categoryId}" not found, using fallback`)
    }

    return category || (categories.length > 0 ? categories[0] : { id: 'unknown', name: 'Unknown' })
  }

  /**
   * Validates that the tags array contains at least the minimum required number of tags.
   */
  private validateTagCount(tags: string[] | undefined): boolean {
    // If tags are undefined or null, they don't meet the minimum count unless the minimum is 0.
    if (!tags) {
      return this.transactionMinTags <= 0
    }

    return tags.length >= this.transactionMinTags
  }

  /**
   * Creates a Transaction object from AI-extracted data, categories, and budget limits.
   */
  private createTransaction(
    transData: z.infer<ReturnType<typeof createSingleTransactionSchema>> | z.infer<ReturnType<typeof createTransactionSchema>>,
    date: Date,
    categories: Category[],
    budgetLimits: BudgetLimit[],
    groupTitle?: string,
  ): Transaction {
    const selectedCategory = this.findCategoryById(transData.categoryId, categories)
    let budgetName: string | undefined
    let budgetRemaining: number | undefined

    // Validate tag count and warn if incorrect
    if (!this.validateTagCount(transData.tags)) {
      logger.warn(`Invalid tag set: Received ${transData.tags?.length || 0} tags, but require at least ${this.transactionMinTags}`)
    }

    // Find budget details if budgetId is provided
    if (transData.budgetId) {
      const budget = budgetLimits.find((limit) => {
        return limit.id === transData.budgetId
      })

      if (budget) {
        budgetName = budget.name
        const limitAmount = Number.parseFloat(budget.amount)
        // spentAmount is typically negative, so adding it subtracts the spent amount
        const spentAmount = Number.parseFloat(budget.spent ?? '0')

        // Ensure calculation results in a number
        if (!Number.isNaN(limitAmount) && !Number.isNaN(spentAmount)) {
          budgetRemaining = limitAmount + spentAmount
        }
        else {
          logger.warn(`Could not calculate budget remaining for budget ${budgetName} (ID: ${transData.budgetId})`, {
            limitAmount: budget.amount,
            spentAmount: budget.spent,
          })
        }
      }
      else {
        logger.warn(`Budget ID ${transData.budgetId} provided but not found in budgetLimits`)
      }
    }

    return {
      amount: transData.amount,
      budgetId: transData.budgetId,
      budgetName,
      budgetRemaining,
      category: selectedCategory,
      date,
      description: transData.description,
      destination: transData.destination,
      ...(groupTitle && { groupTitle }), // Conditionally add groupTitle
      // Conditionally add tags only if they exist and meet the minimum count requirement
      ...(transData.tags && transData.tags.length >= this.transactionMinTags && { tags: transData.tags }),
    }
  }

  /**
   * Prepares messages for the AI model request.
   */
  private async prepareAIMessages(
    imageBuffers: Buffer[],
    messages: ConversationMessage[],
    categories: Category[],
    tags: Tag[] = [],
    budgetLimits: BudgetLimit[] = [],
  ): Promise<CoreMessage[]> {
    logger.debug('Preparing AI messages', {
      imageCount: imageBuffers.length,
      messageCount: messages.length,
    })

    // Format budget limits information for the AI prompt
    const budgetInfo = budgetLimits.length > 0
      ? budgetLimits
          .map((limit) => {
            const spentAmount = limit.spent ?? '0'
            // spentAmount is negative, so adding it calculates remaining
            const remaining = (Number.parseFloat(limit.amount) + Number.parseFloat(spentAmount)).toFixed(2)
            // Include budget ID in the description for the AI

            return `- Budget ID: ${limit.id}, Name: ${limit.name}: ${limit.amount} (Remaining: ${remaining})`
          })
          .join('\n')
      : 'Budget limits are not set.'

    const categoriesInfo = categories.map((cat) => {
      return `${cat.id}: ${cat.name}`
    })
      .join(', ')

    // General tag info without specific prefixes
    const tagsInfo = tags.length > 0
      ? `Available tags:\n${tags.map((tag) => {
        return `- ${tag.name}: ${tag.description || 'No description'}`
      })
        .join('\n')}`
      : 'No predefined tags available.'

    // Get current date for the prompt
    const [currentDate] = new Date()
      .toISOString()
      .split('T')

    let systemPromptTemplate = `Today's date is ${currentDate}.\n ${this.prompt}`

    // Replace all placeholders
    const placeholders: Record<string, string> = {
      [VARIABLES.BUDGET_INFO]: budgetInfo,
      [VARIABLES.CATEGORIES]: categoriesInfo,
      [VARIABLES.MIN_TAGS]: String(this.transactionMinTags),
      [VARIABLES.TAGS]: tagsInfo,
    }

    // Replace all placeholders in the template
    for (const [placeholder, value] of Object.entries(placeholders)) {
      systemPromptTemplate = systemPromptTemplate.replaceAll(placeholder, value)
    }

    // Add user comments handling instructions
    systemPromptTemplate = `${systemPromptTemplate}\n\n
    
    ##  USER COMMENTS HANDLING SYSTEM

    ### PRIORITY RULES:
    1. USER COMMENTS HAVE THE HIGHEST PRIORITY OVER ALL OTHER RULES
    2. When reprocessing a receipt, ALWAYS start by analyzing user comments
    3. Any standard rule IS OVERRIDDEN if the comment indicates otherwise
    4. If the user provides clarifications or additional comments, THEY MUST BE GIVEN TOP PRIORITY

    ### COMMENT PROCESSING WORKFLOW:
    STEP 1: Check for user comments in the request history
    STEP 2: If comments exist - create a list of specific instructions from them
    STEP 3: Process the receipt, applying instructions from comments as priority rules
    STEP 4: Create transactions according to updated rules
    STEP 5: Before finalizing, verify that EVERY comment has been properly addressed

    ### VERIFICATION MECHANISM:
    Before submitting your response, explicitly confirm:
    - Pay special attention to the MOST RECENT comments
    - Which comments were identified
    - How each comment was implemented in the transactions
    - What specific changes were made to follow user instructions

    ### STRICT STRONG RULES:
    - IF THE USER PROVIDES CLARIFICATIONS OR ADDITIONAL COMMENTS, TAKE THEM INTO ACCOUNT WHEN FORMING TRANSACTIONS!!
    - PAY CLOSE ATTENTION TO THE USER'S MOST RECENT COMMENTS, AS THEY MAY OVERRIDE THE DEFAULT CATEGORIZATION RULES!!
    - WHEN THE USER REQUESTS SPECIFIC CHANGES, THEY MUST BE APPLIED EXACTLY AS STATED!!
    - ALWAYS CONFIRM HOW USER COMMENTS WERE ADDRESSED IN YOUR RESPONSE!!
`

    // Initialize AI messages with the system prompt
    const aiMessages: CoreMessage[] = [{ content: systemPromptTemplate, role: 'system' }]

    logger.debug('System prompt prepared')

    // Convert image buffers to base64 data URLs
    const dataUrls = imageBuffers.map((buffer) => {
      const base64Image = buffer.toString('base64')

      return `data:image/jpeg;base64,${base64Image}`
    })

    // Prepare the content for the first user message (text + images)
    const userMessageContent: CoreUserMessage['content'] = []

    // Aggregate initial user text messages (those without images)
    let initialUserText = 'Analyze these receipts and create the transaction(s).'
    const userTextMessages = messages
      .filter((msg) => {
        return msg.role === 'user' && !msg.hasImage && msg.content
      })
      .map((msg) => {
        return msg.content
      })

    if (userTextMessages.length > 0) {
      initialUserText = userTextMessages.join('\n\n') // Combine multiple text messages
    }
    userMessageContent.push({ text: initialUserText, type: 'text' })

    // Add all image data URLs to the first user message
    for (const url of dataUrls) {
      userMessageContent.push({ image: url, type: 'image' })
    }

    // Add the combined user message (text + images)
    aiMessages.push({ content: userMessageContent, role: 'user' })

    // Add remaining conversation history (assistant responses and subsequent user texts)
    for (const msg of messages) {
      // Skip the initial user messages already combined above
      if (msg.role === 'user' && (msg.hasImage || userTextMessages.includes(msg.content))) {
        continue
      }

      if (msg.role === 'assistant') {
        aiMessages.push({
          content: msg.content,
          role: 'assistant',
        })
      }
      else if (msg.role === 'user' && !msg.hasImage) {
        // Add subsequent user messages without images
        aiMessages.push({
          content: msg.content,
          role: 'user',
        } as CoreUserMessage)
      }
    }

    logger.debug(`AI message preparation complete: ${aiMessages.length} messages`)

    return aiMessages
  }

  /**
   * Processes receipt images and conversation messages to generate transactions.
   * @param imageBuffers - Array of Buffers containing receipt images.
   * @param messages - Array of conversation messages.
   * @param categories - Array of available categories.
   * @param tags - Array of available tags.
   * @param budgetLimits - Array of current budget limits.
   * @returns A Promise resolving to a single Transaction or an array of Transactions.
   */
  async processReceiptAndComments(
    imageBuffers: Buffer[],
    messages: ConversationMessage[],
    categories: Category[],
    tags: Tag[] = [],
    budgetLimits: BudgetLimit[] = [],
  ): Promise<Transaction | Transaction[]> {
    logger.info('Processing receipt and comments', {
      imageCount: imageBuffers.length,
      messageCount: messages.length,
    })

    try {
      if (!this.prompt) {
        logger.error('Prompt is not set')
        throw new Error('AI service prompt is not set')
      }

      // Prepare messages for the AI model
      const aiMessages = await this.prepareAIMessages(imageBuffers, messages, categories, tags, budgetLimits)

      // Create schema with the defined minimum tag count
      const multipleTransactionsSchema = createMultipleTransactionsSchema(this.transactionMinTags)

      logger.debug('Sending request to AI model')

      // Request transaction data from the AI model using the multiple transactions schema
      const { object: resultData } = await generateObject({
        abortSignal: AbortSignal.timeout(180000),
        maxRetries: 4,
        messages: aiMessages,
        model: this.openAI,
        schema: multipleTransactionsSchema,
        temperature: 0.4, // Low temperature for more deterministic output
      })

      logger.debug('Received AI model response')

      // Type assertion for resultData
      const typedResultData = resultData as z.infer<ReturnType<typeof createMultipleTransactionsSchema>>

      // Parse the common transaction date
      const transactionDate = this.parseTransactionDate(typedResultData.date)

      // Handle the result based on whether splitting is required
      if (typedResultData.requiresSplit && typedResultData.transactions.length > 0) {
        // Create an array of transactions if splitting is needed
        const groupTitle = typedResultData.groupTitle
          || `Split: ${typedResultData.transactions[0]?.description || 'Grouped Transaction'}`

        logger.info(`Creating split transaction with ${typedResultData.transactions.length} items`)

        const transactions: Transaction[] = typedResultData.transactions.map((transData) => {
          return this.createTransaction(transData, transactionDate, categories, budgetLimits, groupTitle)
        })

        return transactions
      }

      // If no splitting is required but transactions exist, create a single transaction from the first item
      if (typedResultData.transactions.length > 0) {
        logger.info('Creating single transaction from schema')

        return this.createTransaction(
          typedResultData.transactions[0],
          transactionDate,
          categories,
          budgetLimits,
        )
      }

      // Fallback: If the multiple transaction schema returns an empty transactions array,
      // try generating a single transaction using the basic transaction schema.
      logger.warn('Multiple transactions schema returned empty array, attempting single transaction extraction')

      // Create single transaction schema
      const singleTransactionSchema = createSingleTransactionSchema(this.transactionMinTags)

      logger.debug('Sending fallback request to AI model with single transaction schema')

      const { object: extractedData } = await generateObject({
        messages: aiMessages,
        model: this.openAI,
        schema: singleTransactionSchema,
        temperature: 0.2,
      })

      // Type assertion for extractedData
      const typedExtractedData = extractedData as z.infer<ReturnType<typeof createSingleTransactionSchema>>

      const singleTransactionDate = this.parseTransactionDate(typedExtractedData.date)

      logger.info('Created single transaction using fallback schema')

      // Create a single transaction using the fallback data
      return this.createTransaction(
        { // Map extracted data to the input schema format
          amount: typedExtractedData.amount,
          budgetId: typedExtractedData.budgetId,
          categoryId: typedExtractedData.categoryId,
          description: typedExtractedData.description,
          destination: typedExtractedData.destination,
          tags: typedExtractedData.tags,
        },
        singleTransactionDate,
        categories,
        budgetLimits,
      )
    }
    catch (error) {
      // Log and re-throw the error with a user-friendly message
      logger.error('Error processing receipt and comments via AI SDK:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Forward the detailed error message to the user
      throw new Error(`AI API: ${errorMessage}`)
    }
  }
}
