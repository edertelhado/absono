package br.com.absono.auth

import br.com.absono.user.UserMapper
import br.com.absono.user.UserStatus
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class CustomUserDetailsService implements UserDetailsService {

    private final UserMapper userMapper

    CustomUserDetailsService(UserMapper userMapper) {
        this.userMapper = userMapper
    }

    @Override
    UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        def user = userMapper.findById(username)
        if (!user) {
            throw new UsernameNotFoundException('Usuário não encontrado: ' + username)
        }

        String roleName = user.role ? user.role.toString() : br.com.absono.user.UserRole.USER.toString()

        new User(
            user.id,
            user.password,
            [new SimpleGrantedAuthority('ROLE_' + roleName)]
        )
    }
}
