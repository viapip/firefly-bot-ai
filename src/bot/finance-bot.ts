import type { CallbackQuery } from '@telegraf/types'
import type { Context, NarrowedContext } from 'telegraf'
import type { Message, Update } from 'telegraf/types'

import { Buffer } from 'node:buffer'
import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'

import type { BotConfig } from '../config/types'
import type { Transaction } from '../domain/types'
import type { AIServiceClient } from '../services/ai/interfaces'
import type { ConversationManager } from '../services/conversation/interfaces'
import type { FinancialServiceClient } from '../services/financial/interfaces'

import { CALLBACK_DATA_CANCEL, CALLBACK_DATA_CONFIRM, CALLBACK_DATA_NEXT, CALLBACK_DATA_REFINE, CALLBACK_DATA_RETRY, COMMAND_NEXT, CONVERSATION_CLEANUP_INTERVAL_MS, MAX_PROCESSING_ATTEMPTS, STATUS_MAP } from '../constants'
import { createLogger } from '../utils/logger'
import { MediaGroupHandler } from './media-group-handler'
import { ReceiptProcessor } from './receipt-processor'
import { UIFormatter } from './ui-formatter'

const logger = createLogger('FinanceBot')

// Type for callback handler functions
type CallbackHandler = (ctx: Context, userId: string, query: CallbackQuery.DataQuery) => Promise<void>

export class FinanceBot {
  private aiService: AIServiceClient
  private bot: Telegraf
  private callbackHandlers!: Map<string, CallbackHandler>
  private config: BotConfig
  private conversationManager: ConversationManager
  private financialService: FinancialServiceClient
  private mediaGroupHandler: MediaGroupHandler
  private receiptProcessor: ReceiptProcessor
  private uiFormatter: UIFormatter

  constructor(
    config: BotConfig,
    financialService: FinancialServiceClient,
    aiService: AIServiceClient,
    conversationManager: ConversationManager,
  ) {
    this.config = config
    this.financialService = financialService
    this.aiService = aiService
    this.conversationManager = conversationManager
    this.bot = new Telegraf(config.telegramToken)

    this.mediaGroupHandler = new MediaGroupHandler(
      this.handleSinglePhoto.bind(this),
      this.conversationManager,
    )

    this.receiptProcessor = new ReceiptProcessor(
      this.aiService,
      this.financialService,
      this.conversationManager,
    )

    this.uiFormatter = new UIFormatter()

    this.setupHandlers()
    this.setupCallbackHandlers() // Initialize the callback handlers

    // Periodic cleanup of old conversations
    setInterval(() => {
      this.conversationManager.cleanupOldConversations()
    }, CONVERSATION_CLEANUP_INTERVAL_MS)
  }

  // Setup message handlers
  private setupHandlers(): void {
    // Start command
    this.bot.command('start', this.handleStartCommand.bind(this))

    // Cancel command
    this.bot.command('cancel', this.handleCancelCommand.bind(this))

    // Photo (receipts) handling
    this.bot.on(message('photo'), this.handlePhotoMessage.bind(this))

    // Text message handling
    this.bot.on(message('text'), this.handleTextMessage.bind(this))

    // Callback query handling
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this))
  }

  // Initialize the map of callback handlers
  private setupCallbackHandlers(): void {
    this.callbackHandlers = new Map<string, CallbackHandler>([
      [CALLBACK_DATA_CONFIRM, this.handleConfirmCallback.bind(this)],
      [CALLBACK_DATA_REFINE, this.handleRefineCallback.bind(this)],
      [CALLBACK_DATA_CANCEL, this.handleCancelCallback.bind(this)],
      [CALLBACK_DATA_RETRY, this.handleRetryCallback.bind(this)],
      [CALLBACK_DATA_NEXT, this.handleNextCallback.bind(this)],
    ])
  }

  // Start the bot
  public start(): void {
    this.bot.launch()
  }

  // Stop the bot
  public stop(): void {
    this.bot.stop()
  }

  // Helper methods
  private getUserId(ctx: Context): string {
    return ctx.from?.id.toString() || ''
  }

  // Message handlers
  private async handleStartCommand(ctx: Context): Promise<void> {
    const userId = this.getUserId(ctx)
    this.conversationManager.resetConversation(userId)
    await ctx.reply('Hello! Send me a photo of a receipt, and I\'ll help you process it.')
  }

  private async handleCancelCommand(ctx: Context): Promise<void> {
    const userId = this.getUserId(ctx)
    // Cancel any pending media group processing for this user
    this.mediaGroupHandler.cancelPendingMediaGroupForUser(userId)
    this.conversationManager.resetConversation(userId)
    await ctx.reply('Current processing cancelled. Send me a new receipt when you\'re ready.')
  }

  // Photo Handler
  private async handlePhotoMessage(
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
  ): Promise<void> {
    const userId = this.getUserId(ctx)
    const mediaGroupId = ctx.message.media_group_id

    try {
      const imageBuffer = await this.getImageBufferFromMessage(ctx)

      if (mediaGroupId) {
        await this.mediaGroupHandler.handleMediaGroupPhoto(ctx, userId, mediaGroupId, imageBuffer)
      }
      else {
        await this.handleSinglePhoto(ctx, userId, imageBuffer)
      }
    }
    catch (error) {
      await this.handlePhotoProcessingError(ctx, error, mediaGroupId)
    }
  }

  private async handleSinglePhoto(
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
    userId: string,
    imageBuffer: Buffer,
  ): Promise<void> {
    // If a single photo arrives, cancel any pending group for this user
    this.mediaGroupHandler.cancelPendingMediaGroupForUser(userId)

    const conversation = this.conversationManager.getOrCreateConversation(userId)
    const isFirstPhoto = conversation.status === STATUS_MAP.IDLE

    if (isFirstPhoto) {
      this.conversationManager.resetConversation(userId)
    }

    // Save single image
    this.conversationManager.saveImageKeepContext(userId, imageBuffer)
    this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_COMMENT)

    // Add placeholder message for the single image
    const imageIndex = conversation.currentImages ? conversation.currentImages.length - 1 : 0
    this.conversationManager.addUserMessage(userId, '', true, imageIndex) // Mark as image

    const responseMessage = isFirstPhoto
      ? 'I received your receipt photo. Add a comment or type "next" to continue without a comment.'
      : 'I received another photo. Add a comment or send more photos. Type "next" to process.'

    await ctx.reply(responseMessage, this.uiFormatter.getRefinementNextKeyboard())
  }

  private async handlePhotoProcessingError(ctx: Context, error: unknown, mediaGroupId?: string): Promise<void> {
    await ctx.reply('Could not process the photo. Please try again.')
    console.error('Error processing photo:', error)
    // Clean up if error occurred mid-group processing
    if (mediaGroupId) {
      this.mediaGroupHandler.cleanupMediaGroup(mediaGroupId)
    }
  }

  private async getImageBufferFromMessage(
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
  ): Promise<Buffer> {
    // Get the highest resolution photo
    const photos = ctx.message.photo
    const bestQualityPhoto = photos[photos.length - 1]?.file_id // Access last element safely

    if (!bestQualityPhoto) {
      throw new Error('Could not get the photo file_id')
    }

    // Get image link
    const fileLink = await ctx.telegram.getFileLink(bestQualityPhoto)
    const response = await fetch(fileLink.toString())

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  private async handleTextMessage(
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.TextMessage>>,
  ): Promise<void> {
    const userId = this.getUserId(ctx)
    const text = ctx.message.text || ''

    // Cancel any pending media group processing if user sends text
    this.mediaGroupHandler.cancelPendingMediaGroupForUser(userId)

    // Get current dialog state
    const conversation = this.conversationManager.getOrCreateConversation(userId)

    // Special handling for "next" command to trigger processing
    if (text.toLowerCase() === COMMAND_NEXT && (conversation.status === STATUS_MAP.AWAITING_COMMENT)) {
      await this.handleNextCommand(ctx, userId, conversation)

      return
    }

    if (conversation.status === STATUS_MAP.IDLE) {
      // Process text as a potential transaction or receipt description
      await this.handleTextAsTransaction(ctx, userId, text)

      return
    }

    // Handle comments normally if awaiting comment or confirmation
    if (
      conversation.status === STATUS_MAP.AWAITING_COMMENT || conversation.status === STATUS_MAP.AWAITING_CONFIRMATION
    ) {
      await this.handleComment(ctx, userId, text, conversation)
    }
  }

  // New method to handle text as a potential transaction
  private async handleTextAsTransaction(
    ctx: Context,
    userId: string,
    text: string,
  ): Promise<void> {
    // Add the text as a user message
    this.conversationManager.addUserMessage(userId, text)

    // Instead of processing immediately, just set the state to AWAITING_COMMENT
    this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_COMMENT)

    // Let the user know they need to type "next" to process
    await ctx.reply('I\'ve received your transaction description. Type "next" to process it, or add more details with another message.', this.uiFormatter.getRefinementNextKeyboard())
  }

  private async handleNextCommand(ctx: Context, userId: string, conversation: ReturnType<ConversationManager['getOrCreateConversation']>): Promise<void> {
    // Add an empty message to represent the "next" command in history
    this.conversationManager.addUserMessage(userId, '') // No need to mark as image

    if (!conversation.currentImages || conversation.currentImages.length === 0) {
      // No images, but we might have text for a text-based transaction
      // Process the text transaction
      await this.processTextTransaction(ctx, userId)
    }
    else {
      // We have images, process as a receipt
      await this.processReceipt(ctx, userId)
    }
  }

  // Method to process a text-based transaction after "next" command
  private async processTextTransaction(ctx: Context, userId: string): Promise<void> {
    await ctx.reply('Processing your transaction description, please wait...')
    this.conversationManager.updateStatus(userId, STATUS_MAP.PROCESSING)

    try {
      // Process the text using AI service
      const transactions = await this.processTextAsTransaction(ctx, userId)

      // Add AI response to dialog history
      const aiResponse = this.uiFormatter.generateAIResponseMessage(transactions)
      this.conversationManager.addAssistantMessage(userId, aiResponse)

      // Show result to user for confirmation
      await this.showTransactionsForConfirmation(ctx, transactions)
    }
    catch (error) {
      await this.handleProcessingError(ctx, userId, error)
    }
  }

  // Method to process text using AI
  private async processTextAsTransaction(
    ctx: Context,
    userId: string,
  ): Promise<Transaction[]> {
    logger.info(`Processing text transaction for user ${userId}`)

    try {
      // Get categories, tags, and budget limits for AI processing
      const [
        categories,
        tags,
        budgetLimits,
      ] = await this.fetchFinancialData(userId)

      // Get conversation messages for context
      const messages = this.conversationManager.getMessagesForAI(userId)
      logger.debug(`Retrieved ${messages.length} messages for text processing for user ${userId}`)

      if (messages.length === 0 || !messages.some((m) => {
        return m.role === 'user' && m.content.trim() !== ''
      })) {
        throw new Error('No transaction description found. Please provide a description of your transaction.')
      }

      // Process the text using AI service
      logger.debug(`Sending text to AI for processing for user ${userId}`)
      const aiResult = await this.aiService.processReceiptAndComments(
        [], // No images for text-based transactions
        messages,
        categories,
        tags,
        budgetLimits,
      )

      const transactions = Array.isArray(aiResult) ? aiResult : [aiResult]

      if (transactions.length === 0) {
        throw new Error('Failed to create any transactions from the text description. Please try with more details.')
      }

      logger.info(`Generated ${transactions.length} transactions from text for user ${userId}`)

      // Validate transactions
      this.validateTransactions(transactions)

      // Save result and update status
      this.conversationManager.saveTransactions(userId, transactions)
      this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)

      return transactions
    }
    catch (error) {
      logger.error(`Error processing text transaction for user ${userId}:`, error)

      // Pass along the original error without modifying it
      // This allows detailed AI API errors to reach the user

      throw error
    }
  }

  // Helper method to validate transactions before saving
  private validateTransactions(transactions: Transaction[]): void {
    for (const transaction of transactions) {
      // Check required fields
      if (transaction.amount <= 0) {
        throw new Error('Transaction amount must be greater than zero')
      }

      if (!transaction.description || transaction.description.trim() === '') {
        throw new Error('Transaction must have a description')
      }

      if (!transaction.category || !transaction.category.id) {
        throw new Error('Transaction must have a category')
      }

      if (!transaction.date) {
        throw new Error('Transaction must have a date')
      }
    }
  }

  // Helper method to fetch financial data
  private async fetchFinancialData(userId: string) {
    try {
      logger.debug(`Fetching financial data for text transaction for user ${userId}`)

      const results = await Promise.all([
        this.financialService.getCategories(),
        this.financialService.getTags(),
        this.financialService.getBudgetLimits(),
        this.financialService.fetchAndSetDefaultAccount(),
      ])

      return results.slice(0, 3) as [typeof results[0], typeof results[1], typeof results[2]]
    }
    catch (error) {
      logger.error(`Failed to fetch financial data for text transaction for user ${userId}:`, error)
      throw new Error(`Failed to fetch required data from financial service: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async handleComment(ctx: Context, userId: string, text: string, conversation: ReturnType<ConversationManager['getOrCreateConversation']>) {
    // Add comment to dialog history
    this.conversationManager.addUserMessage(userId, text)

    // If awaiting comment, just acknowledge and wait for "next"
    if (conversation.status === STATUS_MAP.AWAITING_COMMENT) {
      // Acknowledge the comment but don't process yet
      await ctx.reply('Comment added. Type "next" to process, or send more details/photos.', this.uiFormatter.getRefinementNextKeyboard())
      // DO NOT trigger processing here. Processing is triggered by the "next" command.
      // Prevent falling through
    }
    // This handles refinement text *after* the user clicks the "Refine" button
    // and the status is updated by transitionToRefinement (likely back to AWAITING_COMMENT or similar).
    // The check in handleTextMessage prevents reaching here if status is still AWAITING_CONFIRMATION.
    else if (conversation.status === STATUS_MAP.AWAITING_CONFIRMATION) {
      // If awaiting confirmation, refinement text triggers reprocessing
      await ctx.reply('Processing your refinement request...')

      // Check if we have images or if this is a text-based transaction
      if (conversation.currentImages && conversation.currentImages.length > 0) {
        // For photo-based transactions, use processReceipt
        await this.processReceipt(ctx, userId)
      }
      else {
        // For text-based transactions, use processTextTransaction
        await this.processTextTransaction(ctx, userId)
      }
    }
  }

  private async handleCallbackQuery(ctx: Context): Promise<void> {
    // Ensure callbackQuery and data exist
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      console.warn('Received callback query without data or not a data query.')
      try {
        await ctx.answerCbQuery()
      }
      catch (error) {
        console.warn('Failed to answer potentially invalid callback query:', error)
      }

      return
    }

    const userId = this.getUserId(ctx)
    // Cancel any pending media group processing
    this.mediaGroupHandler.cancelPendingMediaGroupForUser(userId)

    const query = ctx.callbackQuery // Already checked it has 'data'
    const { data } = query

    // Find the handler in the map
    const handler = this.callbackHandlers.get(data)

    if (handler) {
      try {
        await handler(ctx, userId, query)
      }
      catch (error) {
        console.error(`Error executing callback handler for data "${data}":`, error)
        // Attempt to notify the user about the error
        try {
          await ctx.reply('An internal error occurred while processing your request. Please try again later or contact support.')
        }
        catch (replyError) {
          console.error('Failed to send error reply to user:', replyError)
        }
      }
    }
    else {
      console.warn(`Received unknown callback query data: ${data}`)
    }

    // Always attempt to answer the callback query to remove the loading state
    try {
      await ctx.answerCbQuery()
    }
    catch {
      // Ignore errors here, likely due to timeout or already answered
      // console.warn('Failed to answer callback query (potentially expired):', error);
    }
  }

  // --- Callback Handler Methods ---

  private async handleConfirmCallback(ctx: Context, userId: string): Promise<void> {
    await this.confirmTransaction(ctx, userId)
  }

  private async handleRefineCallback(ctx: Context, userId: string): Promise<void> {
    this.conversationManager.transitionToRefinement(userId)
    await ctx.reply('Okay, the transaction details are ready for refinement. Please provide additional details or corrections.')
  }

  private async handleCancelCallback(ctx: Context, userId: string): Promise<void> {
    this.conversationManager.resetConversation(userId)
    await ctx.reply('Transaction cancelled. Send me a new receipt when you\'re ready.')
  }

  private async handleRetryCallback(ctx: Context, userId: string): Promise<void> {
    await ctx.reply('Retrying your request, please wait...')
    // Check if we should retry processing images or text
    const conversation = this.conversationManager.getOrCreateConversation(userId)
    if (conversation.currentImages && conversation.currentImages.length > 0) {
      await this.processReceipt(ctx, userId)
    }
    else {
      // Assume retry for text processing if no images
      await this.processTextTransaction(ctx, userId)
    }
  }

  private async handleNextCallback(ctx: Context, userId: string): Promise<void> {
    const conversation = this.conversationManager.getOrCreateConversation(userId)
    // Need to answer the callback query here specifically for 'next'
    // because handleNextCommand doesn't inherently answer it.
    // We already attempt to answer globally at the end of handleCallbackQuery,
    // so specific answering here might be redundant unless we want custom text.
    // Let's remove the potentially problematic answerCbQuery call here and rely on the final one.
    await this.handleNextCommand(ctx, userId, conversation)
  }

  // --- End Callback Handler Methods ---

  // Receipt processing using separated service
  private async processReceipt(ctx: Context, userId: string): Promise<void> {
    const conversation = this.conversationManager.getOrCreateConversation(userId)

    // Get all current images for processing
    const imagesForProcessing = conversation.currentImages

    if (!imagesForProcessing || imagesForProcessing.length === 0) {
      // Check again, although handlers should prevent this state
      await ctx.reply('No images found to process. Please send the receipt photo again.')

      return
    }

    await ctx.reply('Processing the receipt(s), please wait...')
    this.conversationManager.updateStatus(userId, STATUS_MAP.PROCESSING)

    try {
      const transactions = await this.receiptProcessor.processReceipt(userId, imagesForProcessing)

      // Add AI response to dialog history
      const aiResponse = this.uiFormatter.generateAIResponseMessage(transactions)
      this.conversationManager.addAssistantMessage(userId, aiResponse)

      // Show result to user for confirmation
      await this.showTransactionsForConfirmation(ctx, transactions)
    }
    catch (error) {
      await this.handleProcessingError(ctx, userId, error)
    }
  }

  private async handleProcessingError(ctx: Context, userId: string, error: unknown): Promise<void> {
    const attempts = this.conversationManager.incrementProcessingAttempts(userId)
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Create a logger instance using a closure to include userId in all log messages
    const logger = createLogger(`FinanceBot:${userId.substring(0, 6)}`)

    logger.error('Processing error:', {
      attempts,
      error,
      errorMessage,
    })

    // Save the error to conversation state for retry
    this.conversationManager.setLastError(userId, errorMessage)

    // Different handling based on number of attempts
    if (attempts >= MAX_PROCESSING_ATTEMPTS) {
      logger.info(`Maximum attempts (${MAX_PROCESSING_ATTEMPTS}) reached, resetting conversation`)

      try {
        await ctx.reply(
          'Failed to process the receipt after several attempts. '
          + 'This could be due to:'
          + '\n- Image quality issues'
          + '\n- Complex receipt format'
          + '\n- Connection problems with the processing service'
          + '\n\nPlease try again with a clearer image or start over with the /start command.',
        )

        // Reset the conversation to start fresh
        this.conversationManager.resetConversation(userId)
      }
      catch (replyError) {
        logger.error('Failed to send max attempts error message to user:', replyError)
      }
    }
    else {
      logger.info(`Attempt ${attempts} failed, allowing retry`)

      try {
        // Change status back to awaiting_comment to allow refinement/retry
        this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_COMMENT)

        // Display the complete error message to the user
        const userMessage = `Error: ${errorMessage}`

        // Use UIFormatter to create retry keyboard
        await ctx.reply(userMessage, this.uiFormatter.getRetryKeyboard())
      }
      catch (replyError) {
        logger.error('Failed to send error message to user:', replyError)

        // Last resort fallback
        try {
          await ctx.reply('An error occurred. Please try again or type /start to reset.')
        }
        catch {
          logger.error('Failed to send fallback error message')
        }
      }
    }
  }

  private async showTransactionsForConfirmation(ctx: Context, transactions: Transaction[]): Promise<void> {
    const fullMessage = transactions.length === 1
      ? this.uiFormatter.formatSingleTransactionConfirmation(transactions[0])
      : this.uiFormatter.formatMultipleTransactionsConfirmation(transactions)

    const MAX_LENGTH = 4096 // Telegram message length limit
    const keyboard = this.uiFormatter.getConfirmationKeyboard()

    if (fullMessage.length <= MAX_LENGTH) {
      // Message is short enough, send as is with keyboard
      await ctx.reply(fullMessage, keyboard)
    }
    else {
      // Message is too long, split it
      const chunks: string[] = []
      let currentChunk = ''
      // Split primarily by double newline, then single newline, then spaces if necessary
      const lines = fullMessage.split('\n\n') // Prefer splitting transaction blocks

      for (const line of lines) {
        // Check if adding the next block (plus separator) exceeds the limit
        if (currentChunk.length + line.length + (currentChunk.length > 0 ? 2 : 0) > MAX_LENGTH) {
          // If adding the block exceeds limit, push current chunk and start new one
          // But first, try splitting the oversized block by single newlines
          if (line.length > MAX_LENGTH) {
            // If the block itself is too long, split it by single newline
            const subLines = line.split('\n')
            for (const subLine of subLines) {
              if (currentChunk.length + subLine.length + (currentChunk.length > 0 ? 1 : 0) > MAX_LENGTH) {
                chunks.push(currentChunk)
                currentChunk = subLine
              }
              else {
                currentChunk += (currentChunk.length > 0 ? '\n' : '') + subLine
              }
            }
            // If anything remains in currentChunk after splitting the long line, push it
            if (currentChunk.length > 0) {
              chunks.push(currentChunk)
              currentChunk = '' // Reset for the next line/block
            }
          }
          else {
            // The block isn't too long itself, but adding it makes the chunk too long
            // Push the current chunk and start the new one with this block
            chunks.push(currentChunk)
            currentChunk = line
          }
        }
        else {
          // Add the block to the current chunk
          currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + line
        }
      }

      // Add the last remaining chunk
      if (currentChunk.length > 0) {
        chunks.push(currentChunk)
      }

      // Send all chunks except the last one
      for (let i = 0; i < chunks.length - 1; i++) {
        await ctx.reply(chunks[i])
      }

      // Send the last chunk with the keyboard
      await ctx.reply(chunks[chunks.length - 1], keyboard)
    }
  }

  private async confirmTransaction(ctx: Context, userId: string): Promise<void> {
    const userLogger = createLogger(`FinanceBot:${userId.substring(0, 6)}`)
    userLogger.info('Confirming transaction')

    const conversation = this.conversationManager.getOrCreateConversation(userId)

    if (!conversation.currentTransactions || conversation.currentTransactions.length === 0) {
      userLogger.warn('No transactions found for confirmation')
      await ctx.reply('No transactions found for confirmation.')

      return
    }

    try {
      // Send acknowledgement to user
      await ctx.reply('Sending transactions...')

      // Get transaction details for logging
      const transactionCount = conversation.currentTransactions.length
      const totalAmount = conversation.currentTransactions.reduce((sum, t) => {
        return sum + t.amount
      }, 0)
      userLogger.info(`Sending ${transactionCount} transactions with total amount ${totalAmount}`)

      // Send to financial service
      const result = await this.financialService.sendTransactions(conversation.currentTransactions)

      if (result) {
        userLogger.info('Transactions sent successfully')
        try {
          await this.sendSuccessMessage(ctx, conversation.currentTransactions)

          // Clean up after successful transaction
          this.conversationManager.clearOldImages(userId, 0)
          this.conversationManager.resetConversation(userId, false)
          userLogger.debug('Conversation reset after successful transaction')
        }
        catch (successError) {
          userLogger.error('Error sending success message:', successError)
          // Still consider the operation successful even if we couldn't show success message
          await ctx.reply('Transactions have been successfully sent!')

          // Still clean up
          this.conversationManager.clearOldImages(userId, 0)
          this.conversationManager.resetConversation(userId, false)
        }
      }
      else {
        // Service returned false but not an error
        userLogger.warn('Financial service returned failure')
        await ctx.reply(
          'The financial service could not process the transactions. This might be due to:'
          + '\n- Invalid transaction data'
          + '\n- Service temporarily unavailable'
          + '\n\nPlease try confirming again or cancel.',
        )
        // Keep state as awaiting_confirmation so user can retry confirm/refine/cancel
        this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      userLogger.error('Error confirming transactions:', error)

      // Determine appropriate user-facing message based on error type
      let userMessage: string

      if (errorMessage.includes('network') || errorMessage.includes('timeout')
        || errorMessage.includes('connect') || errorMessage.includes('fetch')) {
        userMessage = 'Could not connect to the financial service. Please check your internet connection and try again.'
      }
      else if (errorMessage.includes('authentication') || errorMessage.includes('token')
        || errorMessage.includes('unauthorized') || errorMessage.includes('403')) {
        userMessage = 'Authentication error with the financial service. Please contact the administrator.'
      }
      else if (errorMessage.includes('default') || errorMessage.includes('account')) {
        userMessage = 'Could not find the default account in the financial service. Please check your configuration.'
      }
      else {
        userMessage = 'An error occurred while sending the transactions. Please try confirming again or cancel.'
      }

      await ctx.reply(userMessage)

      // Keep state as awaiting_confirmation so user can retry confirm/refine/cancel
      this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)
    }
  }

  private async sendSuccessMessage(ctx: Context, transactions: Transaction[]): Promise<void> {
    const userId = this.getUserId(ctx)
    const userLogger = createLogger(`FinanceBot:${userId.substring(0, 6)}`)
    userLogger.debug('Formatting success message')

    // Edit the "Sending transactions..." message instead of sending a new one
    const messageOptions = {
      chat_id: ctx.chat?.id,
      message_id: ctx.callbackQuery?.message?.message_id, // ID of the message with buttons
    }

    const successText = this.uiFormatter.formatSuccessMessage(transactions)

    try {
      if (messageOptions.chat_id && messageOptions.message_id) {
        userLogger.debug('Editing previous message with success text')
        // Edit the original message (that had the buttons)
        await ctx.telegram.editMessageText(
          messageOptions.chat_id,
          messageOptions.message_id,
          undefined,
          successText,
        )
      }
      else {
        userLogger.debug('No previous message to edit, sending new success message')
        // Fallback if message ID is not available
        await ctx.reply(successText)
      }

      // Optionally send a follow-up message inviting the user to send more receipts
      await ctx.reply('You can send me another receipt or transaction description whenever you\'re ready.')
    }
    catch (error) {
      userLogger.warn('Failed to edit success message, sending reply instead:', error)
      // Try to get the error message, but don't expose API details to users
      let fallbackErrorMessage = 'telegram message edit failed'

      if (error instanceof Error // Check for Telegram-specific errors that might indicate the message is too old
        && (error.message.includes('message to edit not found')
          || error.message.includes('message can\'t be edited'))) {
        fallbackErrorMessage = 'the original message can no longer be edited'
      }

      try {
        // Add context to the success message when falling back
        await ctx.reply(
          `${successText}\n\n(Note: Could not update previous message because ${fallbackErrorMessage})`,
        )
      }
      catch (secondError) {
        // Last resort if even the fallback fails
        userLogger.error('Failed to send fallback success message:', secondError)
        await ctx.reply('Transaction completed successfully!')
      }
    }
  }
}
