package br.com.absono.invite

import java.time.LocalDateTime

class Invite {
    String id
    String code
    String createdBy
    int maxUses
    int useCount
    LocalDateTime expiresAt
    LocalDateTime createdAt
}
