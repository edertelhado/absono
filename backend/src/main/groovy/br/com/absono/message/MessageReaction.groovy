package br.com.absono.message

import java.time.LocalDateTime

class MessageReaction {
    String id
    String messageId
    String userId
    String emoji
    LocalDateTime createdAt
}
