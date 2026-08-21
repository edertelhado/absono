package br.com.absono.user

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping('/api')
class UserController {

    private final UserService userService

    UserController(UserService userService) {
        this.userService = userService
    }

    @GetMapping('/me')
    ResponseEntity<?> getCurrentUser() {
        def user = userService.getCurrentUser()
        ResponseEntity.ok(user)
    }

    @PutMapping('/me/profile')
    ResponseEntity<?> updateProfile(@RequestBody UpdateProfileRequest request) {
        def user = userService.getCurrentUser()
        def updated = userService.updateProfile(user.id, request)
        ResponseEntity.ok(updated)
    }

    @PutMapping('/me/avatar')
    ResponseEntity<?> updateAvatar(@RequestParam('file') MultipartFile file) {
        def user = userService.getCurrentUser()
        def updated = userService.updateAvatar(user.id, file)
        ResponseEntity.ok(updated)
    }

    @PutMapping('/me/status')
    ResponseEntity<?> updateStatus(@RequestBody Map body) {
        def user = userService.getCurrentUser()
        def updated = userService.updateStatus(user.id, body.status as String)
        ResponseEntity.ok(updated)
    }

    @GetMapping('/users')
    ResponseEntity<?> searchUsers(
        @RequestParam(defaultValue = '') String q,
        @RequestParam(defaultValue = '20') int limit
    ) {
        if (q.isBlank()) {
            ResponseEntity.ok(userService.getAllUsers())
        } else {
            ResponseEntity.ok(userService.searchUsers(q, limit))
        }
    }

    @GetMapping('/users/{id}')
    ResponseEntity<?> getUser(@PathVariable String id) {
        def user = userService.getUserById(id)
        ResponseEntity.ok(user)
    }

    @PutMapping('/users/{id}/role')
    ResponseEntity<?> updateUserRole(@PathVariable String id, @RequestBody Map body) {
        def requester = userService.getCurrentUser()
        def updated = userService.updateUserRole(requester.id, id, body.role as String)
        ResponseEntity.ok(updated)
    }
}
