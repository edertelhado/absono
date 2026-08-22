package br.com.absono.channel

import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api/dm')
class DmController {

    private final DmService dmService
    private final UserService userService

    DmController(DmService dmService, UserService userService) {
        this.dmService = dmService
        this.userService = userService
    }

    @GetMapping
    ResponseEntity<?> list() {
        def user = userService.getCurrentUser()
        ResponseEntity.ok(dmService.listForUser(user.id))
    }

    @PostMapping('/with/{otherUserId}')
    ResponseEntity<?> openWith(@PathVariable String otherUserId) {
        def user = userService.getCurrentUser()
        ResponseEntity.ok(dmService.openWith(user.id, otherUserId))
    }
}
