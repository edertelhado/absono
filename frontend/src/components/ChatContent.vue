<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/useChatStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePermissionStore } from '@/stores/usePermissionStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { webSocketService } from '@/services/websocket'
import { messageService } from '@/services/message'
import { formatRelativeTime, getAvatarUrl, formatFileSize } from '@/utils'
import { renderRichMessage } from '@/utils/markdown'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Message, MessageAttachment } from '@/types'

const chatStore = useChatStore()
const channelStore = useChannelStore()
const authStore = useAuthStore()
const permissionStore = usePermissionStore()
const presenceStore = usePresenceStore()

const knownUsernames = computed(() => new Set(presenceStore.users.map(u => u.username.toLowerCase())))

const messageInput = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const messagesContainer = ref<HTMLDivElement | null>(null)
const replyingTo = ref<Message | null>(null)
const editingMessage = ref<Message | null>(null)
const editContent = ref('')

const channel = computed(() => channelStore.currentChannel)
const messages = computed(() => chatStore.messages)
const loading = computed(() => chatStore.loading)
const hasMore = computed(() => chatStore.hasMore)
const canWrite = computed(() => permissionStore.can(channel.value?.id, 'canWrite'))
const canManage = computed(() => permissionStore.can(channel.value?.id, 'canManage'))

// ===== Autocomplete de menções =====
const mentionToken = computed(() => {
  const m = /(^|\s)@([A-Za-z0-9_]*)$/.exec(messageInput.value ?? '')
  return m ? m[2].toLowerCase() : null
})
const mentionMatches = computed(() => {
  const q = mentionToken.value
  if (q === null) return []
  return presenceStore.users
    .filter(u => u.id !== authStore.user?.id && u.username.toLowerCase().startsWith(q))
    .slice(0, 6)
})

const mentionOpen = computed(() => mentionMatches.value.length > 0)

function applyMention(username: string) {
  messageInput.value = (messageInput.value ?? '').replace(/@([A-Za-z0-9_]*)$/, `@${username} `)
}

function onEnterKey() {
  if (mentionOpen.value && mentionMatches.value.length > 0) {
    applyMention(mentionMatches.value[0].username)
    return
  }
  sendMessage()
}

const REACTION_EMOJIS = ['👍','❤️','😂','🎉','😮','😢','🔥','👀','✅','❌','🙏','👏','🚀','💯','🤔','😅','😍','🤝','⚡','🐛']

function isOwn(message: Message): boolean {
  return message.userId === authStore.user?.id
}

function toggleReaction(message: Message, r?: { emoji?: string; userIds?: string[] }) {
  const emoji = r?.emoji
  const userIds = r?.userIds
  if (!emoji || !userIds) return
  chatStore.toggleReaction(message.id, emoji, !userIds.includes(authStore.user?.id ?? ''))
}

function addReaction(message: Message, emoji: string) {
  const already = message.reactions?.some(r => r.emoji === emoji && r.userIds.includes(authStore.user?.id ?? ''))
  if (already) return
  chatStore.toggleReaction(message.id, emoji, true)
}

let lastTypingSent = 0

function onInputTyping() {
  if (!channel.value || !authStore.user) return
  const now = Date.now()
  if (now - lastTypingSent < 2500) return
  lastTypingSent = now
  webSocketService.publishTyping(channel.value.id, authStore.user.id)
}

const searchVisible = ref(false)
const searchQuery = ref('')
const searchResults = ref<Message[]>([])
const searching = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (!searchVisible.value) {
    clearSearch()
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  searching.value = false
  if (searchDebounce) {
    clearTimeout(searchDebounce)
    searchDebounce = null
  }
}

watch(searchQuery, (q) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  const query = q.trim()
  if (!query || !channel.value) {
    searchResults.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchDebounce = setTimeout(async () => {
    try {
      searchResults.value = await messageService.searchMessages(channel.value!.id, query)
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || 'Erro ao buscar mensagens')
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 350)
})

function highlightMatch(content: string): { text: string; match: boolean }[] {
  const query = searchQuery.value.trim()
  if (!query) return [{ text: content, match: false }]

  const parts: { text: string; match: boolean }[] = []
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let index = 0

  while (true) {
    const found = lowerContent.indexOf(lowerQuery, index)
    if (found === -1) {
      parts.push({ text: content.slice(index), match: false })
      break
    }
    if (found > index) {
      parts.push({ text: content.slice(index, found), match: false })
    }
    parts.push({ text: content.slice(found, found + query.length), match: true })
    index = found + query.length
  }

  return parts.filter(p => p.text.length > 0)
}

const typingLabel = computed(() => {
  const others = chatStore.typingUserIds.filter(id => id !== authStore.user?.id)
  if (others.length === 0) return ''
  const names = others.map(id => {
    const u = presenceStore.users.find(x => x.id === id)
    return u?.displayName || 'Alguém'
  })
  if (names.length === 1) return `${names[0]} está digitando...`
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando...`
  return `${names.length} pessoas estão digitando...`
})

async function sendMessage() {
  if (!messageInput.value.trim()) return

  try {
    await chatStore.sendMessage(messageInput.value.trim(), replyingTo.value?.id)
    messageInput.value = ''
    replyingTo.value = null
    await nextTick()
    scrollToBottom()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao enviar mensagem')
  }
}

const uploadProgress = ref<{ pct: number; name: string } | null>(null)
const uploading = computed(() => uploadProgress.value !== null)

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > 50 * 1024 * 1024) {
    ElMessage.warning('Arquivo excede o limite de 50MB')
    return
  }

  uploadProgress.value = { pct: 0, name: file.name }
  try {
    await chatStore.sendAttachment(file, (pct) => {
      if (uploadProgress.value) {
        uploadProgress.value = { pct, name: file.name }
      }
    })
    ElMessage.success('Arquivo enviado com sucesso')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao enviar arquivo')
  } finally {
    uploadProgress.value = null
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

async function startEdit(message: Message) {
  editingMessage.value = message
  editContent.value = message.content
}

async function saveEdit() {
  if (!editingMessage.value || !editContent.value.trim()) return
  try {
    await chatStore.editMessage(editingMessage.value.id, editContent.value.trim())
    editingMessage.value = null
    editContent.value = ''
  } catch (e: any) {
    ElMessage.error('Erro ao editar mensagem')
  }
}

async function deleteMessage(message: Message) {
  try {
    await ElMessageBox.confirm('Tem certeza que deseja excluir esta mensagem?', 'Excluir mensagem', {
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      type: 'warning',
    })
    await chatStore.deleteMessage(message.id)
    ElMessage.success('Mensagem excluída')
  } catch {}
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function handleScroll() {
  const el = messagesContainer.value
  if (!el) return
  const { scrollTop } = el
  if (scrollTop > 120 || !hasMore.value || loading.value) return

  // preserva a posição visual ao inserir mensagens mais antigas acima
  const prevHeight = el.scrollHeight
  await chatStore.loadMoreMessages()
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight - prevHeight + scrollTop
  }
}

function isOwnMessage(message: Message): boolean {
  return message.userId === authStore.user?.id
}

function canModifyMessage(message: Message): boolean {
  return isOwnMessage(message) || canManage.value
}

function isImageFile(attachment: MessageAttachment): boolean {
  if (attachment.mimeType?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(attachment.fileName)
}

function isVideoFile(attachment: MessageAttachment): boolean {
  if (attachment.mimeType?.startsWith('video/')) return true
  return /\.(mp4|webm|ogv|mov)$/i.test(attachment.fileName)
}

function isAudioFile(attachment: MessageAttachment): boolean {
  if (attachment.mimeType?.startsWith('audio/')) return true
  return /\.(mp3|ogg|wav|flac|m4a)$/i.test(attachment.fileName)
}

const lightboxAttachment = ref<MessageAttachment | null>(null)

function openLightbox(attachment: MessageAttachment) {
  lightboxAttachment.value = attachment
}

function closeLightbox() {
  lightboxAttachment.value = null
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeLightbox()
}

function downloadUrl(attachment: MessageAttachment): string {
  return `${attachment.url}?download=true`
}

watch(() => messages.value.length, () => {
  nextTick(() => scrollToBottom())
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  scrollToBottom()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="chat-view">
    <div class="chat-header" v-if="channel">
      <template v-if="channel.type === 'DIRECT'">
        <img class="header-avatar" :src="getAvatarUrl(channel.peerAvatarUrl, channel.peerUsername || '')" />
        <span class="header-name">{{ channel.peerName || channel.peerUsername }}</span>
      </template>
      <template v-else>
        <span class="header-hash">#</span>
        <span class="header-name">{{ channel.name }}</span>
      </template>
      <span class="header-divider"></span>
      <span class="header-description" v-if="channel.description">{{ channel.description }}</span>

      <div class="header-actions">
        <el-input
          v-if="searchVisible"
          v-model="searchQuery"
          placeholder="Buscar no canal..."
          size="small"
          class="search-input"
          clearable
          @keyup.escape="toggleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button text circle size="small" class="search-toggle" @click="toggleSearch">
          <el-icon><component :is="searchVisible ? 'Close' : 'Search'" /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="typing-indicator" v-if="typingLabel">
      <span class="typing-dots"><span></span><span></span><span></span></span>
      {{ typingLabel }}
    </div>

    <div class="search-results" v-if="searchVisible && searchQuery.trim()">
      <div v-if="searching" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>Buscando...</span>
      </div>

      <template v-else>
        <div class="search-summary" v-if="searchResults.length > 0">
          {{ searchResults.length }} resultado(s) para "{{ searchQuery.trim() }}"
        </div>

        <div v-if="searchResults.length === 0" class="empty-state">
          Nenhuma mensagem encontrada.
        </div>

        <div
          v-for="message in searchResults"
          :key="message.id"
          class="message-wrapper"
        >
          <el-avatar class="message-avatar" :size="36" :src="getAvatarUrl(message.avatarUrl, message.username || '')" />

          <div class="message-content">
            <div class="message-header">
              <span class="message-author">{{ message.displayName || message.username }}</span>
              <span class="message-time">{{ formatRelativeTime(message.createdAt) }}</span>
            </div>
            <div class="message-text">
              <template v-for="(part, i) in highlightMatch(message.content)" :key="i">
                <mark v-if="part.match" class="search-highlight">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="messages-container" v-else ref="messagesContainer" @scroll="handleScroll">
      <div v-if="loading && messages.length === 0" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>Carregando mensagens...</span>
      </div>

      <div
        v-for="message in messages"
        :key="message.id"
        class="message-wrapper"
        :class="{ own: isOwnMessage(message) }"
      >
        <el-avatar class="message-avatar" :size="36" :src="getAvatarUrl(message.avatarUrl, message.username || '')" />

        <div class="message-content">
          <div class="message-header">
            <span class="message-author">{{ message.displayName || message.username }}</span>
            <span class="message-time">{{ formatRelativeTime(message.createdAt) }}</span>
            <span v-if="message.edited" class="message-edited">(editado)</span>
          </div>

          <div v-if="editingMessage?.id === message.id" class="message-edit">
            <el-input
              v-model="editContent"
              @keyup.enter="saveEdit"
              @keyup.escape="editingMessage = null"
              size="small"
            />
            <div class="edit-actions">
              <el-button size="small" text @click="editingMessage = null">Cancelar</el-button>
              <el-button size="small" type="primary" @click="saveEdit">Salvar</el-button>
            </div>
          </div>

          <div v-else class="message-text md" v-html="renderRichMessage(message.content, knownUsernames)"></div>

          <div class="reactions-row" v-if="message.reactions?.length || isOwn(message)">
            <button
              v-for="r in message.reactions"
              :key="r.emoji"
              class="reaction-chip"
              :class="{ mine: r.userIds.includes(authStore.user?.id ?? '') }"
              @click="toggleReaction(message, r)"
            >
              <span class="reaction-emoji">{{ r.emoji }}</span>
              <span class="reaction-count">{{ r.count }}</span>
            </button>

            <el-popover trigger="click" :width="264" placement="top-start">
              <template #reference>
                <button class="reaction-add" title="Adicionar reação">
                  <el-icon><Plus /></el-icon>
                </button>
              </template>
              <div class="emoji-grid">
                <button
                  v-for="e in REACTION_EMOJIS"
                  :key="e"
                  class="emoji-option"
                  @click="addReaction(message, e)"
                >{{ e }}</button>
              </div>
            </el-popover>
          </div>

          <div v-if="message.attachments?.length" class="message-attachments">
            <div
              v-for="attachment in message.attachments"
              :key="attachment.id"
              class="attachment"
            >
              <template v-if="isImageFile(attachment)">
                <img
                  :src="attachment.url"
                  :alt="attachment.fileName"
                  class="attachment-image"
                  @click="openLightbox(attachment)"
                />
                <span class="attachment-caption">
                  {{ attachment.fileName }} · {{ formatFileSize(attachment.fileSize) }}
                  <a :href="downloadUrl(attachment)" class="attachment-download">Baixar</a>
                </span>
              </template>
              <template v-else-if="isVideoFile(attachment)">
                <video :src="attachment.url" controls preload="metadata" class="attachment-video"></video>
                <span class="attachment-caption">
                  {{ attachment.fileName }} · {{ formatFileSize(attachment.fileSize) }}
                  <a :href="downloadUrl(attachment)" class="attachment-download">Baixar</a>
                </span>
              </template>
              <template v-else-if="isAudioFile(attachment)">
                <audio :src="attachment.url" controls preload="metadata" class="attachment-audio"></audio>
                <span class="attachment-caption">
                  {{ attachment.fileName }} · {{ formatFileSize(attachment.fileSize) }}
                  <a :href="downloadUrl(attachment)" class="attachment-download">Baixar</a>
                </span>
              </template>
              <a v-else :href="downloadUrl(attachment)" class="attachment-file">
                <el-icon><Document /></el-icon>
                <span class="attachment-name">{{ attachment.fileName }}</span>
                <span class="attachment-size">{{ formatFileSize(attachment.fileSize) }}</span>
              </a>
            </div>
          </div>

          <div class="message-actions" v-if="canModifyMessage(message)">
            <el-button size="small" text circle title="Editar mensagem" @click="startEdit(message)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button size="small" text circle title="Excluir mensagem" @click="deleteMessage(message)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="chat-input-area" v-if="['TEXT', 'DIRECT'].includes(channel?.type ?? '') && canWrite">
      <div v-if="uploadProgress" class="upload-progress">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span class="upload-name">{{ uploadProgress.name }}</span>
        <el-progress
          :percentage="uploadProgress.pct"
          :stroke-width="6"
          :show-text="true"
          class="upload-bar"
        />
      </div>

      <div class="reply-indicator" v-if="replyingTo">
        <span><strong>{{ replyingTo.displayName || replyingTo.username }}</strong></span>
        <el-button text circle size="small" @click="replyingTo = null">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <div class="input-row">
        <el-button class="attach-btn" text circle :disabled="uploading" @click="fileInput?.click()">
          <el-icon><Upload /></el-icon>
        </el-button>
        <input
          ref="fileInput"
          type="file"
          style="display: none"
          @change="handleFileUpload"
          accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
        />

        <div v-if="mentionOpen && mentionMatches.length" class="mention-popover">
          <button
            v-for="u in mentionMatches"
            :key="u.id"
            class="mention-option"
            @mousedown.prevent="applyMention(u.username)"
          >
            <el-avatar :size="20" :src="getAvatarUrl(u.avatarUrl, u.username)" />
            <span class="mention-name">{{ u.displayName }}</span>
            <small class="mention-username">@{{ u.username }}</small>
          </button>
        </div>

        <el-input
          v-model="messageInput"
          placeholder="Enviar mensagem..."
          @keyup.enter="onEnterKey"
          @input="onInputTyping"
          size="large"
          class="message-input"
        />

        <el-button
          class="send-btn"
          type="primary"
          circle
          @click="sendMessage"
          :disabled="!messageInput.trim()"
        >
          <el-icon><Promotion /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="no-write-access" v-else-if="['TEXT', 'DIRECT'].includes(channel?.type ?? '') && !canWrite">
      Você não tem permissão para enviar mensagens neste canal.
    </div>

    <div v-if="lightboxAttachment" class="lightbox" @click.self="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <el-icon><Close /></el-icon>
      </button>
      <img :src="lightboxAttachment.url" :alt="lightboxAttachment.fileName" />
      <div class="lightbox-caption">{{ lightboxAttachment.fileName }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--absono-bg-base);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 48px;
  min-height: 48px;
  padding: 0 var(--space-lg);
  background: var(--absono-surface-1);
  border-bottom: 1px solid var(--absono-border);
}

.header-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.header-hash {
  font-size: 18px;
  font-weight: 600;
  color: var(--absono-text-muted);
}

.header-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--absono-text);
}

.header-divider {
  width: 1px;
  height: 16px;
  background: var(--absono-border);
  margin: 0 var(--space-sm);
}

.header-description {
  font-size: 13px;
  color: var(--absono-text-muted);
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.search-input {
  width: 220px;

  :deep(.el-input__wrapper) {
    background-color: var(--absono-surface-2);
    box-shadow: none;
    border: 1px solid var(--absono-border);
  }
}

.search-toggle {
  color: var(--absono-text-muted);

  &:hover {
    color: var(--absono-text);
  }
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-summary {
  font-size: 12px;
  color: var(--absono-text-muted);
  padding-bottom: var(--space-md);
}

.empty-state {
  text-align: center;
  padding: var(--space-xl);
  color: var(--absono-text-muted);
  font-size: 13px;
}

.search-highlight {
  background-color: rgba(15, 76, 163, 0.35);
  color: var(--absono-text);
  border-radius: 2px;
  padding: 0 1px;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-lg);
  font-size: 12px;
  color: var(--absono-text-muted);
  min-height: 26px;
}

.typing-dots {
  display: inline-flex;
  gap: 3px;

  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: var(--absono-primary);
    animation: typing-bounce 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }

    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

@keyframes typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message-wrapper {
  display: flex;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  transition: background-color 0.1s ease;

  &:hover {
    background-color: var(--absono-hover);

    .message-actions {
      opacity: 1;
    }
  }
}

.message-avatar {
  margin-top: 2px;
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 4px;
}

.message-author {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--absono-text);
}

.message-time {
  font-size: 11px;
  color: var(--absono-text-muted);
}

.message-edited {
  font-size: 10px;
  color: var(--absono-text-muted);
  font-style: italic;
}

.message-text {
  font-size: 14px;
  color: var(--absono-text-secondary);
  line-height: 1.55;
  word-break: break-word;
}

.message-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.edit-actions {
  display: flex;
  gap: var(--space-xs);
  justify-content: flex-end;
}

.message-actions {
  display: flex;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.message-attachments {
  margin-top: var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.attachment {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--absono-surface-2);
  border-radius: var(--radius-md);
  max-width: fit-content;
}

.attachment-image {
  max-width: 400px;
  max-height: 300px;
  border-radius: var(--radius-md);
  display: block;
  cursor: zoom-in;
}

.attachment-video {
  width: min(480px, 100%);
  max-height: 320px;
  border-radius: var(--radius-md);
  display: block;
}

.attachment-audio {
  width: min(360px, 100%);
}

.attachment-caption {
  display: block;
  margin-top: var(--space-xs);
  font-size: 11px;
  color: var(--absono-text-secondary);
}

.attachment-download {
  margin-left: var(--space-sm);
  color: var(--absono-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.lightbox {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;

  img {
    max-width: 90vw;
    max-height: 85vh;
    border-radius: var(--radius-md);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  }
}

.lightbox-caption {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.5);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-md);
  max-width: 80vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.22);
  }
}

.attachment-file {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  text-decoration: none;
  color: var(--absono-text);

  &:hover .attachment-name {
    text-decoration: underline;
  }
}

.attachment-name {
  font-size: 13px;
  color: var(--absono-text);
}

.attachment-size {
  font-size: 11px;
  color: var(--absono-text-muted);
}

.reactions-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.reaction-chip,
.reaction-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid var(--absono-border);
  background: var(--absono-surface-2);
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease;

  &:hover {
    background: var(--absono-hover);
    border-color: var(--absono-primary);
  }

  .reaction-emoji { font-size: 14px; line-height: 1; }
  .reaction-count { font-size: 12px; font-weight: 600; color: var(--absono-text-secondary); }
}

.reaction-chip.mine {
  border-color: var(--absono-primary);
  background: var(--absono-primary-subtle);

  .reaction-count { color: var(--absono-primary); }
}

.reaction-add {
  opacity: 0;
  color: var(--absono-text-muted);

  .message-wrapper:hover & { opacity: 1; }
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;

  .emoji-option {
    font-size: 18px;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;

    &:hover { background: var(--absono-hover); }
  }
}

/* ===== Markdown ===== */
.message-text.md {
  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    font-family: var(--font-display);
    color: var(--absono-text);
    margin: var(--space-sm) 0 2px;
    line-height: 1.25;
  }
  :deep(h1) { font-size: 20px; border-bottom: 1px solid var(--absono-border); padding-bottom: 4px; }
  :deep(h2) { font-size: 17px; }
  :deep(h3) { font-size: 15px; }
  :deep(h4) { font-size: 14px; }

  :deep(p) { margin: 2px 0; }

  :deep(u) { text-underline-offset: 3px; }

  :deep(code) {
    font-family: monospace;
    font-size: 13px;
    background: var(--absono-surface-3, rgba(255,255,255,0.08));
    padding: 1px 5px;
    border-radius: var(--radius-sm);
  }

  :deep(pre) {
    background: var(--absono-surface-3, rgba(255,255,255,0.08));
    border: 1px solid var(--absono-border);
    border-radius: var(--radius-md);
    padding: var(--space-sm);
    overflow-x: auto;
    margin: var(--space-xs) 0;

    code { background: none; padding: 0; }
  }

  :deep(blockquote) {
    margin: var(--space-xs) 0;
    padding: 2px var(--space-md);
    border-left: 3px solid var(--absono-border);
    color: var(--absono-text-muted);
  }

  :deep(a) { color: var(--absono-primary); }

  :deep(ul), :deep(ol) { margin: 4px 0; padding-left: 22px; }

  :deep(hr) { border-color: var(--absono-border); margin: var(--space-sm) 0; }
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  color: var(--absono-text-muted);
}

.load-more {
  text-align: center;
  padding: var(--space-sm);
}

.chat-input-area {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--absono-border);
  background: var(--absono-surface-1);
}

.upload-progress {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  background: var(--absono-surface-2);
  border: 1px solid var(--absono-border);
  border-radius: var(--radius-md);

  .upload-name {
    font-size: 12px;
    color: var(--absono-text-secondary);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .upload-bar {
    flex: 1;

    :deep(.el-progress__text) {
      font-size: 11px !important;
      color: var(--absono-text-muted);
    }
  }
}

.no-write-access {
  padding: var(--space-md) var(--space-lg);
  text-align: center;
  font-size: 13px;
  color: var(--absono-text-muted);
  background: var(--absono-surface-1);
  border-top: 1px solid var(--absono-border);
}

.reply-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-xs) var(--space-sm);
  margin-bottom: var(--space-sm);
  font-size: 12px;
  color: var(--absono-text-secondary);
  background: var(--absono-primary-subtle);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--absono-primary);

  strong {
    color: var(--absono-text);
  }
}

.input-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--absono-surface-2);
  border-radius: var(--radius-lg);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--absono-border);
}

.attach-btn {
  color: var(--absono-text-muted);
  transition: color 0.12s ease;

  &:hover {
    color: var(--absono-text);
  }
}

.mention-popover {
  position: absolute;
  bottom: var(--space-md);
  left: var(--space-sm);
  z-index: 30;
  min-width: 240px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--absono-surface-1);
  border: 1px solid var(--absono-border);
  border-radius: var(--radius-md);
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.35);
}

.mention-option {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 6px var(--space-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--absono-text);

  &:hover { background: var(--absono-hover); }

  .mention-name { font-size: 13px; font-weight: 500; }
  .mention-username { margin-left: auto; color: var(--absono-text-muted); font-size: 11px; }
}

.send-btn {
  width: 36px;
  height: 36px;
}

.message-input {
  flex: 1;

  :deep(.el-input__wrapper) {
    background: transparent;
    box-shadow: none;
  }

  :deep(.el-input__inner) {
    background: transparent;
  }
}
</style>
