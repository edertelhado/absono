package br.com.absono.channel

import java.time.LocalDateTime

class ChannelPermission {
    String id
    String channelId
    String userId
    boolean canRead
    boolean canWrite
    boolean canManage
    LocalDateTime createdAt
}
