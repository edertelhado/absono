package br.com.absono.message

import java.time.LocalDateTime

class MessageAttachment {
    String id
    String messageId
    String fileName
    String mimeType
    long fileSize
    String s3Key
    String url
    LocalDateTime createdAt
}
