package br.com.absono.channel

import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api/channels')
class ChannelController {

    private final ChannelService channelService
    private final UserService userService

    ChannelController(ChannelService channelService, UserService userService) {
        this.channelService = channelService
        this.userService = userService
    }

    @GetMapping
    ResponseEntity<?> getAllChannels() {
        def user = userService.getCurrentUser()
        ResponseEntity.ok(channelService.getVisibleChannels(user.id))
    }

    @GetMapping('/{id}')
    ResponseEntity<?> getChannel(@PathVariable String id) {
        def user = userService.getCurrentUser()
        def channel = channelService.getChannelById(id)
        def perms = channelService.getEffectivePermissions(id, user.id)
        if (!perms.canRead) {
            return ResponseEntity.status(403).body([success: false, message: 'Sem permissão para acessar este canal'])
        }
        ResponseEntity.ok(channel)
    }

    @GetMapping('/{id}/my-permissions')
    ResponseEntity<?> getMyPermissions(@PathVariable String id) {
        def user = userService.getCurrentUser()
        channelService.getChannelById(id)
        ResponseEntity.ok(channelService.getEffectivePermissions(id, user.id))
    }

    @PostMapping
    ResponseEntity<?> createChannel(@RequestBody CreateChannelRequest request) {
        def user = userService.getCurrentUser()
        def channel = channelService.createChannel(request, user.id)
        ResponseEntity.ok(channel)
    }

    @PutMapping('/{id}')
    ResponseEntity<?> updateChannel(@PathVariable String id, @RequestBody UpdateChannelRequest request) {
        def user = userService.getCurrentUser()
        def channel = channelService.updateChannel(id, request, user.id)
        ResponseEntity.ok(channel)
    }

    @DeleteMapping('/{id}')
    ResponseEntity<?> deleteChannel(@PathVariable String id) {
        def user = userService.getCurrentUser()
        channelService.deleteChannel(id, user.id)
        ResponseEntity.ok([success: true, message: 'Canal excluído com sucesso'])
    }

    @PutMapping('/{id}/reorder')
    ResponseEntity<?> reorderChannel(@PathVariable String id, @RequestBody Map body) {
        def user = userService.getCurrentUser()
        int position = body.position as int
        channelService.reorderChannel(id, position, user.id)
        ResponseEntity.ok([success: true])
    }
}
