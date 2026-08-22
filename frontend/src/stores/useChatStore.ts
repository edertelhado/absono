import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Message, MessageAttachment } from '@/types'
import { messageService } from '@/services/message'
import { webSocketService } from '@/services/websocket'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([])
  const loading = ref(false)
  const hasMore = ref(true)
  const total = ref(0)
  const currentChannelId = ref<string | null>(null)
  const typingUserIds = ref<string[]>([])

  const typingTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

  const sortedMessages = computed(() => {
    return [...messages.value].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  })

  function setCurrentChannel(channelId: string) {
    if (currentChannelId.value !== channelId) {
      currentChannelId.value = channelId
      messages.value = []
      hasMore.value = true
      total.value = 0
      typingUserIds.value = []
      loadMessages()
      webSocketService.subscribeToChannel(channelId, handleSocketMessage)
    }
  }

  async function loadMessages() {
    if (!currentChannelId.value || loading.value) return
    loading.value = true
    try {
      const response = await messageService.getMessages(currentChannelId.value, 50, 0)
      messages.value = response.messages
      total.value = response.total
      hasMore.value = response.hasMore
    } finally {
      loading.value = false
    }
  }

  async function loadMoreMessages() {
    if (!currentChannelId.value || loading.value || !hasMore.value) return
    loading.value = true
    try {
      const response = await messageService.getMessages(currentChannelId.value, 50, messages.value.length)
      messages.value = [...response.messages, ...messages.value]
      total.value = response.total
      hasMore.value = response.hasMore
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(content: string, replyToId?: string) {
    if (!currentChannelId.value) return
    const message = await messageService.sendMessage(currentChannelId.value, content, replyToId)
    // Will be added via WebSocket event
    return message
  }

  async function editMessage(messageId: string, content: string) {
    await messageService.editMessage(messageId, content)
  }

  async function deleteMessage(messageId: string) {
    await messageService.deleteMessage(messageId)
  }

  async function uploadAttachment(file: File): Promise<MessageAttachment> {
    return await messageService.uploadAttachment(file)
  }

  async function sendAttachment(file: File, onProgress?: (pct: number) => void) {
    const uploaded = await messageService.uploadAttachment(file, onProgress)
    const message = await sendMessage('')
    if (!message?.id) throw new Error('Falha ao criar mensagem do anexo')
    const attachment = await messageService.attachToMessage(message.id, {
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.fileSize,
      s3Key: uploaded.s3Key,
      url: uploaded.url,
    })
    return { message, attachment }
  }

  function handleSocketMessage(data: any) {
    if (!data || !data.type) return

    switch (data.type) {
      case 'NEW_MESSAGE':
        messages.value.push(data.data)
        if (data.data?.userId) {
          clearTyping(data.data.userId)
        }
        break
      case 'TYPING':
        handleTyping(data.data?.userId)
        break
      case 'MESSAGE_EDITED':
        const editIndex = messages.value.findIndex(m => m.id === data.data.id)
        if (editIndex !== -1) {
          messages.value[editIndex] = { ...messages.value[editIndex], ...data.data }
        }
        break
      case 'MESSAGE_DELETED':
        messages.value = messages.value.filter(m => m.id !== data.data.id)
        break
      case 'MESSAGE_ATTACHMENTS': {
        const idx = messages.value.findIndex(m => m.id === data.data?.messageId)
        if (idx !== -1) {
          messages.value[idx] = {
            ...messages.value[idx],
            attachments: data.data.attachments,
          }
        }
        break
      }
    }
  }

  function handleTyping(userId: string | undefined) {
    if (!userId) return
    if (!typingUserIds.value.includes(userId)) {
      typingUserIds.value = [...typingUserIds.value, userId]
    }

    clearTimeout(typingTimeouts[userId])
    typingTimeouts[userId] = setTimeout(() => {
      clearTyping(userId)
    }, 4000)
  }

  function clearTyping(userId: string) {
    clearTimeout(typingTimeouts[userId])
    delete typingTimeouts[userId]
    typingUserIds.value = typingUserIds.value.filter(id => id !== userId)
  }

  return {
    messages: sortedMessages,
    loading,
    hasMore,
    total,
    currentChannelId,
    typingUserIds,
    setCurrentChannel,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    uploadAttachment,
    sendAttachment,
  }
})
