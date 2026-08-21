import SockJS from 'sockjs-client/dist/sockjs'
import Stomp, { Message } from 'stompjs'

type MessageHandler = (data: any) => void

class WebSocketService {
  private client: Stomp.Client | null = null
  private subscriptions: Map<string, any> = new Map()
  private connected = false
  private handlers: Map<string, MessageHandler[]> = new Map()

  connect() {
    if (this.connected) return

    const token = localStorage.getItem('absono_token')
    const socket = new SockJS('/ws')
    this.client = Stomp.over(socket)

    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    this.client.connect(headers, () => {
      this.connected = true
      this.resubscribe()
    }, (error) => {
      console.error('Erro WebSocket:', error)
      this.connected = false
      setTimeout(() => this.connect(), 5000)
    })
  }

  disconnect() {
    if (this.client) {
      this.client.disconnect(() => {})
      this.connected = false
      this.subscriptions.clear()
    }
  }

  subscribeToChannel(channelId: string, handler: MessageHandler) {
    const topic = `/topic/channels/${channelId}`

    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, [])
    }
    this.handlers.get(topic)!.push(handler)

    if (this.client && this.connected) {
      this.doSubscribe(topic)
    }
  }

  unsubscribeFromChannel(channelId: string) {
    const topic = `/topic/channels/${channelId}`
    this.handlers.delete(topic)
    const sub = this.subscriptions.get(topic)
    if (sub) {
      sub.unsubscribe()
      this.subscriptions.delete(topic)
    }
  }

  subscribeToPresence(handler: MessageHandler) {
    const topic = '/topic/presence'
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, [])
    }
    this.handlers.get(topic)!.push(handler)

    if (this.client && this.connected) {
      this.doSubscribe(topic)
    }
  }

  subscribeToNotifications(handler: MessageHandler) {
    const topic = '/user/queue/notifications'

    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, [])
    }
    this.handlers.get(topic)!.push(handler)

    if (this.client && this.connected) {
      this.doSubscribe(topic)
    }
  }

  subscribeToVoiceState(handler: MessageHandler) {
    const topic = '/topic/voice-state'
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, [])
    }
    this.handlers.get(topic)!.push(handler)

    if (this.client && this.connected) {
      this.doSubscribe(topic)
    }
  }

  private doSubscribe(topic: string) {
    if (!this.client || this.subscriptions.has(topic)) return

    const sub = this.client.subscribe(topic, (message: Message) => {
      try {
        const data = JSON.parse(message.body)
        const handlers = this.handlers.get(topic)
        handlers?.forEach(h => h(data))
      } catch (e) {
        console.error('Erro ao processar mensagem STOMP:', e)
      }
    })

    this.subscriptions.set(topic, sub)
  }

  private resubscribe() {
    this.handlers.forEach((_handlers, topic) => {
      this.doSubscribe(topic)
    })
  }

  isConnected() {
    return this.connected
  }

  publishTyping(channelId: string, userId: string) {
    if (!this.client || !this.connected) return

    try {
      this.client.send(`/app/channels/${channelId}/typing`, {}, JSON.stringify({ userId }))    } catch (e) {
      console.error('Erro ao publicar typing:', e)
    }
  }
}

export const webSocketService = new WebSocketService()
