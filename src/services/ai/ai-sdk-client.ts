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
import { createMultipleTransactionsSchema, createSingleTransactionSchema } from './schemas'

// Constants

export class AISDKClient implements AIServiceClient {
  private openAI: LanguageModelV1
  // Initialize the OpenAI provider, configuring it for OpenRouter
  constructor(
    private transactionMinTags = 0,
    private prompt: string,
    apiKey: string,
    model = DEFAULT_MODEL,
    baseUrl = DEFAULT_OPENROUTER_BASE_URL,
    refererUrl = DEFAULT_REFERER_URL,
  ) {
    try {
      this.openAI = createOpenAI({
        apiKey,
        baseURL: baseUrl,
        headers: {
          'HTTP-Referer': refererUrl,
        },
      })(model) // Pass the specific model to use
    }
    catch (error) {
      console.error('Error initializing AI service:', error)
      throw error
    }
  }

  /**
   * Parses a date string in 'YYYY-MM-DD HH:mm' format into a Date object.
   */
  private parseTransactionDate(dateString: string): Date {
    // Replace space with 'T' for ISO 8601 format compatibility
    return new Date(dateString.replace(' ', 'T'))
  }

  /**
   * Finds a category by ID or returns a default category.
   */
  private findCategoryById(categoryId: string, categories: Category[]): Category {
    const category = categories.find((cat) => {
      return cat.id === categoryId
    })

    // Return found category or the first available category, or a default 'unknown' category
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
      console.warn(`Invalid tag set: Received ${transData.tags?.length || 0} tags, but require at least ${this.transactionMinTags}.`)
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
          console.warn(`Could not calculate budget remaining for budget ${budgetName} (ID: ${transData.budgetId}). Limit: ${budget.amount}, Spent: ${budget.spent}`)
        }
      }
      else {
        console.warn(`Budget ID ${transData.budgetId} provided but not found in budgetLimits.`)
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

    // Read the prompt template from the project root
    let systemPromptTemplate = this.prompt

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

    // Initialize AI messages with the system prompt
    const aiMessages: CoreMessage[] = [{ content: systemPromptTemplate, role: 'system' }]

    console.log('AI messages', JSON.stringify(aiMessages, null, 2)) // Kept for debugging if needed

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
        } as CoreUserMessage) // Type assertion might be needed depending on CoreMessage definition
      }
    }

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
    // Ensure the service is initialized (currently commented out)
    // await this.ensureInitialized()

    try {
      if (!this.prompt) {
        throw new Error('Prompt is not set')
      }

      // Prepare messages for the AI model
      const aiMessages = await this.prepareAIMessages(imageBuffers, messages, categories, tags, budgetLimits)

      // Create schema with the defined minimum tag count
      const multipleTransactionsSchema = createMultipleTransactionsSchema(this.transactionMinTags)

      // Request transaction data from the AI model using the multiple transactions schema
      const { object: resultData } = await generateObject({
        messages: aiMessages,
        model: this.openAI,
        schema: multipleTransactionsSchema,
        temperature: 0.2, // Low temperature for more deterministic output
      })

      // console.log('AI result data:', JSON.stringify(resultData, null, 2)); // Kept for debugging

      // Type assertion for resultData
      const typedResultData = resultData as z.infer<ReturnType<typeof createMultipleTransactionsSchema>>

      // Parse the common transaction date
      const transactionDate = this.parseTransactionDate(typedResultData.date)

      // Handle the result based on whether splitting is required
      if (typedResultData.requiresSplit && typedResultData.transactions.length > 0) {
        // Create an array of transactions if splitting is needed
        const groupTitle = typedResultData.groupTitle
          || `Split: ${typedResultData.transactions[0]?.description || 'Grouped Transaction'}` // Default group title

        const transactions: Transaction[] = typedResultData.transactions.map((transData) => {
          // Pass budgetLimits to createTransaction
          return this.createTransaction(transData, transactionDate, categories, budgetLimits, groupTitle)
        })

        return transactions
      }

      // If no splitting is required but transactions exist, create a single transaction from the first item
      if (typedResultData.transactions.length > 0) {
        // Pass budgetLimits to createTransaction
        return this.createTransaction(typedResultData.transactions[0], transactionDate, categories, budgetLimits)
      }

      // Fallback: If the multiple transaction schema returns an empty transactions array,
      // try generating a single transaction using the basic transaction schema.
      console.warn('Multiple transactions schema returned empty array, attempting single transaction extraction.')

      // Create single transaction schema
      const singleTransactionSchema = createSingleTransactionSchema(this.transactionMinTags)

      const { object: extractedData } = await generateObject({
        messages: aiMessages,
        model: this.openAI,
        schema: singleTransactionSchema,
        temperature: 0.2,
      })

      // Type assertion for extractedData
      const typedExtractedData = extractedData as z.infer<ReturnType<typeof createSingleTransactionSchema>>

      const singleTransactionDate = this.parseTransactionDate(typedExtractedData.date)

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
        budgetLimits, // Pass budgetLimits
      )
    }
    catch (error) {
      // Log and re-throw the error with a user-friendly message
      console.error('Error processing receipt and comments via AI SDK:', error)
      throw new Error(`Failed to process receipt or comments: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
