package br.com.absono.channel

import java.time.LocalDateTime

class Channel {
    String id
    String name
    ChannelType type
    String description
    int position
    boolean active
    String createdBy
    LocalDateTime createdAt
    LocalDateTime updatedAt
}
