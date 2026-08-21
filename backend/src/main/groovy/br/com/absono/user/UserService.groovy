package br.com.absono.user

import br.com.absono.attachment.S3Service
import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile

@Service
class UserService {

    private static final long MAX_AVATAR_SIZE = 5 * 1024 * 1024
    private static final List<String> ALLOWED_IMAGE_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp'
    ]

    private final UserMapper userMapper
    private final PresenceService presenceService
    private final S3Service s3Service

    UserService(UserMapper userMapper, PresenceService presenceService, S3Service s3Service) {
        this.userMapper = userMapper
        this.presenceService = presenceService
        this.s3Service = s3Service
    }

    User getCurrentUser() {
        Authentication auth = SecurityContextHolder.context.authentication
        String userId = auth?.name
        if (!userId) {
            throw new ResourceNotFoundException('Usuário não autenticado')
        }
        def user = userMapper.findById(userId)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado')
        }
        return user
    }

    User getUserById(String id) {
        def user = userMapper.findById(id)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado: ' + id)
        }
        return user
    }

    @Transactional
    User updateProfile(String userId, UpdateProfileRequest request) {
        def user = userMapper.findById(userId)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado')
        }

        String displayName = request.displayName ?: user.displayName
        String bio = request.bio ?: user.bio
        String avatarUrl = request.avatarUrl ?: user.avatarUrl

        userMapper.updateProfile(userId, displayName, bio, avatarUrl)
        userMapper.findById(userId)
    }

    @Transactional
    User updateAvatar(String userId, MultipartFile file) {
        def user = userMapper.findById(userId)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado')
        }

        if (file == null || file.empty) {
            throw new BusinessException('Arquivo vazio')
        }
        if (file.size > MAX_AVATAR_SIZE) {
            throw new BusinessException('Avatar excede o limite de 5MB')
        }
        String mimeType = file.contentType ?: ''
        if (!ALLOWED_IMAGE_TYPES.contains(mimeType)) {
            throw new BusinessException('Formato inválido. Use JPEG, PNG, GIF ou WebP')
        }

        if (user.avatarUrl?.startsWith('/api/files/')) {
            try {
                s3Service.deleteFile(user.avatarUrl.substring('/api/files/'.length()))
            } catch (Exception ignored) {
                // Falha ao remover avatar antigo não deve impedir o novo upload
            }
        }

        String key = s3Service.upload(file, 'avatars')
        String avatarUrl = "/api/files/${key}".toString()

        userMapper.updateProfile(userId, user.displayName, user.bio, avatarUrl)
        userMapper.findById(userId)
    }

    List<User> searchUsers(String query, int limit = 20) {
        userMapper.search("%${query}%", limit)
    }

    List<User> getAllUsers() {
        userMapper.findAll()
    }

    @Transactional
    User updateStatus(String userId, String status) {
        UserStatus validStatus
        try {
            validStatus = UserStatus.valueOf(status)
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException('Status inválido: ' + status)
        }

        if (validStatus == UserStatus.OFFLINE) {
            throw new BusinessException('Use logout para ficar offline')
        }

        userMapper.updateStatus(userId, validStatus.toString())
        presenceService.broadcastStatus(userId, validStatus.toString())
        userMapper.findById(userId)
    }

    @Transactional
    User updateUserRole(String requesterId, String targetUserId, String role) {
        def requester = userMapper.findById(requesterId)
        if (!requester || requester.role != UserRole.ADMIN) {
            throw new BusinessException('Apenas administradores podem alterar roles')
        }

        UserRole validRole
        try {
            validRole = UserRole.valueOf(role)
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException('Role inválida: ' + role)
        }

        if (targetUserId == requesterId && validRole != UserRole.ADMIN) {
            throw new BusinessException('Você não pode remover seu próprio role de admin')
        }

        def target = userMapper.findById(targetUserId)
        if (!target) {
            throw new ResourceNotFoundException('Usuário não encontrado: ' + targetUserId)
        }

        userMapper.updateRole(targetUserId, validRole.toString())
        userMapper.findById(targetUserId)
    }
}

class UpdateProfileRequest {
    String displayName
    String bio
    String avatarUrl
}
