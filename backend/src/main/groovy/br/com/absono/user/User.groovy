package br.com.absono.user

import java.time.LocalDateTime

class User {
    String id
    String username
    String displayName
    String password
    String bio
    String avatarUrl
    UserStatus status
    UserRole role
    LocalDateTime createdAt
    LocalDateTime updatedAt
}
