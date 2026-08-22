package br.com.absono.user

import com.fasterxml.jackson.annotation.JsonIgnore
import java.time.LocalDateTime

class User {
    String id
    String username
    String displayName
    @JsonIgnore
    String password
    String bio
    String avatarUrl
    UserStatus status
    UserRole role
    LocalDateTime createdAt
    LocalDateTime updatedAt
}
