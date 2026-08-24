package br.com.absono.invite

import br.com.absono.common.BusinessException
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api/invites')
class InviteController {

    private final InviteService inviteService

    InviteController(InviteService inviteService) {
        this.inviteService = inviteService
    }

    @PostMapping
    ResponseEntity<?> createInvite(@RequestBody Map<String, Object> body) {
        Authentication auth = SecurityContextHolder.context.authentication
        String userId = auth?.name

        int maxUses = (body.maxUses ?: 1) as int
        int durationMinutes = (body.durationMinutes ?: 15) as int

        def invite = inviteService.createInvite(userId, maxUses, durationMinutes)
        ResponseEntity.ok(invite)
    }

    @GetMapping
    ResponseEntity<?> listInvites() {
        Authentication auth = SecurityContextHolder.context.authentication
        String userId = auth?.name
        ResponseEntity.ok(inviteService.listByUser(userId))
    }

    @DeleteMapping("/{id}")
    ResponseEntity<?> deleteInvite(@PathVariable String id) {
        Authentication auth = SecurityContextHolder.context.authentication
        String userId = auth?.name
        boolean isAdmin = auth?.authorities?.any { it.authority == 'ROLE_ADMIN' }
        inviteService.deleteInvite(id, userId, isAdmin)
        ResponseEntity.ok([success: true, message: 'Convite excluido com sucesso'])
    }

    @GetMapping("/validate/{code}")
    ResponseEntity<?> validateInvite(@PathVariable String code) {
        def invite = inviteService.validateInvite(code)
        ResponseEntity.ok([
            valid: true,
            expiresAt: invite.expiresAt,
            remainingUses: invite.maxUses - invite.useCount
        ])
    }
}
