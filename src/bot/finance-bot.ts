// bot/finance-bot.ts
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

import { CALLBACK_DATA_CANCEL, CALLBACK_DATA_CONFIRM, CALLBACK_DATA_REFINE, CALLBACK_DATA_RETRY, COMMAND_NEXT, CONVERSATION_CLEANUP_INTERVAL_MS, MAX_PROCESSING_ATTEMPTS, STATUS_MAP } from '../constants'
import { MediaGroupHandler } from './media-group-handler'
import { ReceiptProcessor } from './receipt-processor'
import { UIFormatter } from './ui-formatter'

// Constants

export class FinanceBot {
  private aiService: AIServiceClient
  private bot: Telegraf
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

  // Start the bot
  public start(): void {
    this.bot.launch()
    console.log('Bot started')
  }

  // Stop the bot
  public stop(): void {
    this.bot.stop()
    console.log('Bot stopped')
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

    await ctx.reply(responseMessage)
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
    if (conversation.status === STATUS_MAP.AWAITING_COMMENT) {
      await this.handleComment(ctx, userId, text, conversation)
    }
    else if (conversation.status === STATUS_MAP.AWAITING_CONFIRMATION) {
      // If awaiting confirmation, instruct user to use buttons
      await ctx.reply('Please use the buttons above to confirm, refine, or cancel the transaction.')
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
    await ctx.reply('I\'ve received your transaction description. Type "next" to process it, or add more details with another message.')
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
    // Get categories, tags, and budget limits for AI processing
    const [
      categories,
      tags,
      budgetLimits,
    ] = await Promise.all([
      this.financialService.getCategories(),
      this.financialService.getTags(),
      this.financialService.getBudgetLimits(),
      this.financialService.fetchAndSetDefaultAccount(),
    ])

    // Get conversation messages for context
    const messages = this.conversationManager.getMessagesForAI(userId)

    // Process the text using AI service
    const aiResult = await this.aiService.processReceiptAndComments(
      [], // No images for text-based transactions
      messages,
      categories,
      tags,
      budgetLimits,
    )

    const transactions = Array.isArray(aiResult) ? aiResult : [aiResult]

    // Save result and update status
    this.conversationManager.saveTransactions(userId, transactions)
    this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)

    return transactions
  }

  private async handleComment(ctx: Context, userId: string, text: string, conversation: ReturnType<ConversationManager['getOrCreateConversation']>) {
    // Add comment to dialog history
    this.conversationManager.addUserMessage(userId, text)

    // If awaiting comment, just acknowledge and wait for "next"
    if (conversation.status === STATUS_MAP.AWAITING_COMMENT) {
      // Acknowledge the comment but don't process yet
      await ctx.reply('Comment added. Type "next" to process, or send more details/photos.')
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
      console.warn('Received callback query without data.')
      // Attempt to answer anyway to remove the loading state, but log the issue.
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

    const query = ctx.callbackQuery // Now known to have 'data'
    const { data } = query

    if (data === CALLBACK_DATA_CONFIRM) {
      await this.confirmTransaction(ctx, userId)
    }
    else if (data === CALLBACK_DATA_REFINE) {
      // Transition dialog to await further comments for refinement
      this.conversationManager.transitionToRefinement(userId) // Assumes this updates status correctly
      await ctx.reply('Okay, the transaction details are ready for refinement. Please provide additional details or corrections.')
    }
    else if (data === CALLBACK_DATA_CANCEL) {
      this.conversationManager.resetConversation(userId)
      await ctx.reply('Transaction cancelled. Send me a new receipt when you\'re ready.')
    }
    else if (data === CALLBACK_DATA_RETRY) {
      await ctx.reply('Retrying your request, please wait...')
      await this.processReceipt(ctx, userId)
    }
    else {
      console.warn(`Received unknown callback query data: ${data}`)
    }

    try {
      await ctx.answerCbQuery()
    }
    catch (error) {
      console.warn('Failed to answer callback query:', error)
      // Potentially the query expired, ignore safely
    }
  }

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
    console.error('Error processing receipt:', error)
    const attempts = this.conversationManager.incrementProcessingAttempts(userId)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    if (attempts >= MAX_PROCESSING_ATTEMPTS) {
      await ctx.reply('Failed to process the receipt after several attempts. Please try sending a clearer image or start over with the /start command')
      this.conversationManager.resetConversation(userId)
    }
    else {
      // Change status back to awaiting_comment to allow refinement/retry
      this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_COMMENT)
      // Save the error to conversation state for retry
      this.conversationManager.setLastError(userId, errorMessage)

      // Use UIFormatter to create retry keyboard
      await ctx.reply(`An error occurred while processing the receipt: ${errorMessage}`, this.uiFormatter.getRetryKeyboard())
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
    const conversation = this.conversationManager.getOrCreateConversation(userId)

    if (!conversation.currentTransactions || conversation.currentTransactions.length === 0) {
      await ctx.reply('No transactions found for confirmation.')

      return
    }

    try {
      await ctx.reply('Sending transactions...') // Acknowledge confirmation
      const result = await this.financialService.sendTransactions(conversation.currentTransactions)

      if (result) {
        await this.sendSuccessMessage(ctx, conversation.currentTransactions)
      }
      else {
        await ctx.reply('An error occurred while sending the transactions. Please check the service and try confirming again or cancel.')
        // Keep state as awaiting_confirmation so user can retry confirm/refine/cancel
        this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)
      }

      // Only reset conversation fully on success
      if (result) {
        // Clear images before resetting dialog (only if successful)
        this.conversationManager.clearOldImages(userId, 0)
        this.conversationManager.resetConversation(userId, false)
      }
    }
    catch (error) {
      console.error('Error confirming transactions:', error)
      await ctx.reply('An error occurred while sending the transactions. Please try confirming again or cancel.')
      // Keep state as awaiting_confirmation so user can retry confirm/refine/cancel
      this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_CONFIRMATION)
    }
  }

  private async sendSuccessMessage(ctx: Context, transactions: Transaction[]): Promise<void> {
    // Edit the "Sending transactions..." message instead of sending a new one
    const messageOptions = {
      chat_id: ctx.chat?.id,
      message_id: ctx.callbackQuery?.message?.message_id, // ID of the message with buttons
    }

    const successText = this.uiFormatter.formatSuccessMessage(transactions)

    try {
      if (messageOptions.chat_id && messageOptions.message_id) {
        // Edit the original message (that had the buttons)
        await ctx.telegram.editMessageText(messageOptions.chat_id, messageOptions.message_id, undefined, successText)
      }
      else {
        // Fallback if message ID is not available
        await ctx.reply(successText)
      }
    }
    catch (error) {
      console.warn('Failed to edit success message, sending reply instead:', error)
      await ctx.reply(successText) // Fallback to sending a new message
    }
  }
}
