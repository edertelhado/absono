import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUnreadStore = defineStore('unread', () => {
  const counts = ref<Record<string, number>>({})

  function increment(channelId: string) {
    counts.value = { ...counts.value, [channelId]: (counts.value[channelId] ?? 0) + 1 }
  }

  function clear(channelId: string) {
    if (counts.value[channelId]) {
      const next = { ...counts.value }
      delete next[channelId]
      counts.value = next
    }
  }

  return { counts, increment, clear }
})
