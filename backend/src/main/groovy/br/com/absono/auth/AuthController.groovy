package br.com.absono.auth

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api/auth')
class AuthController {

    private final AuthService authService

    AuthController(AuthService authService) {
        this.authService = authService
    }

    @PostMapping('/register')
    ResponseEntity<?> register(@RequestBody @Valid RegisterRequest request) {
        def response = authService.register(request)
        ResponseEntity.status(HttpStatus.CREATED).body(response)
    }

    @PostMapping('/login')
    ResponseEntity<?> login(@RequestBody @Valid LoginRequest request) {
        def response = authService.login(request)
        ResponseEntity.ok(response)
    }

    @PostMapping('/refresh')
    ResponseEntity<?> refresh(@RequestBody @Valid RefreshRequest request) {
        ResponseEntity.ok(authService.refresh(request.refreshToken))
    }

    @PostMapping('/logout')
    ResponseEntity<?> logout() {
        authService.logout()
        ResponseEntity.ok([success: true, message: 'Logout realizado com sucesso'])
    }
}

class RefreshRequest {
    @NotBlank(message = 'Refresh token é obrigatório')
    String refreshToken
}

class RegisterRequest {
    @NotBlank(message = 'Username é obrigatório')
    @Size(min = 3, max = 30, message = 'Username deve ter entre 3 e 30 caracteres')
    String username

    @NotBlank(message = 'Nome de exibição é obrigatório')
    @Size(min = 1, max = 100, message = 'Nome deve ter entre 1 e 100 caracteres')
    String displayName

    @NotBlank(message = 'Senha é obrigatória')
    @Size(min = 6, max = 128, message = 'Senha deve ter entre 6 e 128 caracteres')
    String password
}

class LoginRequest {
    @NotBlank(message = 'Username é obrigatório')
    String username

    @NotBlank(message = 'Senha é obrigatória')
    String password
}

class AuthResponse {
    String accessToken
    String refreshToken
    UserResponse user
}

class UserResponse {
    String id
    String username
    String displayName
    String avatarUrl
    String status
    String role
}
