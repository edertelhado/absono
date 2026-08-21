package br.com.absono.channel

import br.com.absono.user.User
import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api/channels/{channelId}/permissions')
class ChannelPermissionController {

    private final ChannelPermissionService permissionService
    private final UserService userService
    private final ChannelService channelService

    ChannelPermissionController(ChannelPermissionService permissionService, UserService userService, ChannelService channelService) {
        this.permissionService = permissionService
        this.userService = userService
        this.channelService = channelService
    }

    @GetMapping
    ResponseEntity<?> getPermissions(@PathVariable String channelId) {
        User requester = userService.getCurrentUser()
        channelService.getChannelById(channelId)
        permissionService.requireManage(channelId, requester.id)

        def permissions = permissionService.getPermissions(channelId)
        ResponseEntity.ok([permissions: permissions])
    }

    @PutMapping
    ResponseEntity<?> setPermission(@PathVariable String channelId, @RequestBody SetPermissionRequest request) {
        User requester = userService.getCurrentUser()
        channelService.getChannelById(channelId)
        permissionService.requireManage(channelId, requester.id)

        def permission = permissionService.setPermission(
            channelId,
            request.userId,
            Boolean.TRUE == request.canRead,
            Boolean.TRUE == request.canWrite,
            Boolean.TRUE == request.canManage
        )
        ResponseEntity.ok(permission)
    }

    @DeleteMapping('/{userId}')
    ResponseEntity<?> deletePermission(@PathVariable String channelId, @PathVariable String userId) {
        User requester = userService.getCurrentUser()
        permissionService.requireManage(channelId, requester.id)

        permissionService.deletePermission(channelId, userId)
        ResponseEntity.ok([success: true, message: 'Permissão removida com sucesso'])
    }
}

class SetPermissionRequest {
    String userId
    Boolean canRead
    Boolean canWrite
    Boolean canManage
}
