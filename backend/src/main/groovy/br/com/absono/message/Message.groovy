package br.com.absono.message

import java.time.LocalDateTime

class Message {
    String id
    String channelId
    String userId
    String content
    String replyToId
    boolean edited
    LocalDateTime createdAt
    LocalDateTime updatedAt

    String username
    String displayName
    String avatarUrl
    String userStatus
    List<MessageAttachment> attachments
    List<Map<String, Object>> reactions
    List<String> mentions
}
