// bot/media-group-handler.ts
import type { Buffer } from 'node:buffer'
import type { Context, NarrowedContext } from 'telegraf'
import type { Message, Update } from 'telegraf/types'

import type { ConversationManager } from '../services/conversation/interfaces'

// Constants
const MEDIA_GROUP_TIMEOUT_MS = 500
const STATUS_MAP = {
  AWAITING_COMMENT: 'awaiting_comment',
  IDLE: 'idle',
} as const

interface PendingMediaGroup {
  ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>
  photos: Buffer[]
  timerId: NodeJS.Timeout
  userId: string
}

export class MediaGroupHandler {
  private conversationManager: ConversationManager
  private handleSinglePhotoCallback: (
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
    userId: string,
    imageBuffer: Buffer
  ) => Promise<void>

  private mediaGroupTimeout: number
  private pendingMediaGroups: Map<string, PendingMediaGroup>

  constructor(
    handleSinglePhotoCallback: (
      ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
      userId: string,
      imageBuffer: Buffer
    ) => Promise<void>,
    conversationManager: ConversationManager,
    mediaGroupTimeout = MEDIA_GROUP_TIMEOUT_MS,
  ) {
    this.pendingMediaGroups = new Map()
    this.mediaGroupTimeout = mediaGroupTimeout
    this.handleSinglePhotoCallback = handleSinglePhotoCallback
    this.conversationManager = conversationManager
  }

  public async handleMediaGroupPhoto(
    ctx: NarrowedContext<Context, Update.MessageUpdate<Message.PhotoMessage>>,
    userId: string,
    mediaGroupId: string,
    imageBuffer: Buffer,
  ): Promise<void> {
    const existingGroup = this.pendingMediaGroups.get(mediaGroupId)

    if (existingGroup) {
      // Add photo to existing group and reset timer
      clearTimeout(existingGroup.timerId)
      existingGroup.photos.push(imageBuffer)
      existingGroup.timerId = setTimeout(() => {
        this.finalizeMediaGroup(mediaGroupId)
      }, this.mediaGroupTimeout)
      // Update context in case the last message context is needed for reply
      existingGroup.ctx = ctx
    }
    else {
      // Create new group
      const timerId = setTimeout(() => {
        this.finalizeMediaGroup(mediaGroupId)
      }, this.mediaGroupTimeout)
      this.pendingMediaGroups.set(mediaGroupId, {
        ctx, // Store context from the first photo
        photos: [imageBuffer],
        timerId,
        userId,
      })
    }
  }

  public cancelPendingMediaGroupForUser(userId: string): void {
    for (const [id, group] of this.pendingMediaGroups.entries()) {
      if (group.userId === userId) {
        console.log(`Cancelling pending media group ${id} for user ${userId}`)
        clearTimeout(group.timerId)
        this.pendingMediaGroups.delete(id)
        break // Assume only one pending group per user at a time
      }
    }
  }

  public cleanupMediaGroup(mediaGroupId: string): void {
    const group = this.pendingMediaGroups.get(mediaGroupId)
    if (group) {
      clearTimeout(group.timerId)
      this.pendingMediaGroups.delete(mediaGroupId)
    }
  }

  private async finalizeMediaGroup(mediaGroupId: string): Promise<void> {
    const group = this.pendingMediaGroups.get(mediaGroupId)
    if (!group) {
      return // Already processed or cancelled
    }

    const { ctx, photos, userId } = group // Use stored context for replying
    this.pendingMediaGroups.delete(mediaGroupId) // Remove from pending

    console.log(`Finalizing media group ${mediaGroupId} for user ${userId} with ${photos.length} photos.`)

    const conversation = this.conversationManager.getOrCreateConversation(userId)
    const isFirstEvent = conversation.status === STATUS_MAP.IDLE

    if (isFirstEvent) {
      this.conversationManager.resetConversation(userId)
    }

    // Save all images from the group
    for (const photoBuffer of photos) {
      this.conversationManager.saveImageKeepContext(userId, photoBuffer)
    }
    this.conversationManager.updateStatus(userId, STATUS_MAP.AWAITING_COMMENT)

    // Add ONE placeholder message for the entire group
    // Use the index of the *last* image added from the group
    const lastImageIndex = conversation.currentImages ? conversation.currentImages.length - 1 : 0
    this.conversationManager.addUserMessage(userId, '', true, lastImageIndex) // Mark as image, link to last image

    const responseMessage = isFirstEvent
      ? `I received ${photos.length} receipt photos. Add a comment or type "next" to process them.`
      : `I received ${photos.length} more photos. Continue adding comments/photos, or type "next" to process.`

    // Reply using the context associated with the group (preferably the last photo's context)
    await ctx.reply(responseMessage)
  }
}
