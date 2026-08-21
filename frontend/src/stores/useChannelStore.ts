import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Channel, ChannelType } from '@/types'
import { channelService } from '@/services/channel'

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const currentChannel = ref<Channel | null>(null)
  const loading = ref(false)

  async function fetchChannels() {
    loading.value = true
    try {
      const fetched = await channelService.getChannels()
      channels.value = Array.isArray(fetched) ? fetched : []
    } catch (e) {
      console.error('Erro ao buscar canais:', e)
      channels.value = []
    } finally {
      loading.value = false
    }
  }

  function setCurrentChannel(channel: Channel | null) {
    currentChannel.value = channel
  }

  async function createChannel(name: string, type: ChannelType, description: string = '') {
    const channel = await channelService.createChannel(name, type, description)
    channels.value.push(channel)
    return channel
  }

  async function updateChannel(id: string, data: Partial<Channel>) {
    const updated = await channelService.updateChannel(id, data)
    const index = channels.value.findIndex(c => c.id === id)
    if (index !== -1) {
      channels.value[index] = updated
    }
    if (currentChannel.value?.id === id) {
      currentChannel.value = updated
    }
    return updated
  }

  async function deleteChannel(id: string) {
    await channelService.deleteChannel(id)
    channels.value = channels.value.filter(c => c.id !== id)
    if (currentChannel.value?.id === id) {
      currentChannel.value = null
    }
  }

  const textChannels = computed(() => channels.value.filter(c => c.type === 'TEXT' && c.active))
  const voiceChannels = computed(() => channels.value.filter(c => c.type === 'VOICE' && c.active))

  function filterChannels() {
    // mantido por compatibilidade — agora é no-op pois os getters são computed
  }

  return {
    channels,
    currentChannel,
    loading,
    textChannels,
    voiceChannels,
    fetchChannels,
    setCurrentChannel,
    createChannel,
    updateChannel,
    deleteChannel,
    filterChannels,
  }
})
