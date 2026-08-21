package br.com.absono.auth

import br.com.absono.common.AuthException
import br.com.absono.common.BusinessException
import br.com.absono.common.Ulid
import br.com.absono.user.PresenceService
import br.com.absono.user.User
import br.com.absono.user.UserMapper
import br.com.absono.user.UserRole
import br.com.absono.user.UserStatus
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class AuthService {

    private final UserMapper userMapper
    private final PasswordEncoder passwordEncoder
    private final JwtUtil jwtUtil
    private final PresenceService presenceService

    AuthService(UserMapper userMapper, PasswordEncoder passwordEncoder, JwtUtil jwtUtil, PresenceService presenceService) {
        this.userMapper = userMapper
        this.passwordEncoder = passwordEncoder
        this.jwtUtil = jwtUtil
        this.presenceService = presenceService
    }

    @Transactional
    AuthResponse register(RegisterRequest request) {
        def existing = userMapper.findByUsername(request.username)
        if (existing) {
            throw new BusinessException('Username já está em uso')
        }

        String id = Ulid.generate()
        String hashedPassword = passwordEncoder.encode(request.password)

        userMapper.insert(id, request.username, request.displayName, hashedPassword)

        def user = userMapper.findById(id)

        String accessToken = jwtUtil.generateToken(user.id, user.username)
        String refreshToken = jwtUtil.generateRefreshToken(user.id)

        new AuthResponse(
            accessToken: accessToken,
            refreshToken: refreshToken,
            user: toResponse(user)
        )
    }

    AuthResponse login(LoginRequest request) {
        def user = userMapper.findByUsername(request.username)
        if (!user) {
            throw new AuthException('Credenciais inválidas')
        }

        if (!passwordEncoder.matches(request.password, user.password)) {
            throw new AuthException('Credenciais inválidas')
        }

        String accessToken = jwtUtil.generateToken(user.id, user.username)
        String refreshToken = jwtUtil.generateRefreshToken(user.id)

        userMapper.updateStatus(user.id, UserStatus.ONLINE.toString())
        presenceService.broadcastStatus(user.id, UserStatus.ONLINE.toString())

        new AuthResponse(
            accessToken: accessToken,
            refreshToken: refreshToken,
            user: toResponse(user)
        )
    }

    void logout() {
        Authentication auth = SecurityContextHolder.context.authentication
        String userId = auth?.name
        if (userId) {
            userMapper.updateStatus(userId, UserStatus.OFFLINE.toString())
            presenceService.broadcastStatus(userId, UserStatus.OFFLINE.toString())
        }
    }

    private UserResponse toResponse(User user) {
        new UserResponse(
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            status: user.status?.toString(),
            role: (user.role ?: UserRole.USER).toString()
        )
    }
}
