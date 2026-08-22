package br.com.absono.channel

import br.com.absono.user.User
import br.com.absono.user.UserMapper
import br.com.absono.user.UserRole
import spock.lang.Specification

class ProbeSpec extends Specification {

    def "probe 1 - u1 ADMIN"() {
        given:
        def userMapper = Mock(UserMapper)
        userMapper.findById('u1') >> new User(id: 'u1', username: 'x', role: UserRole.ADMIN)

        expect:
        println "P1 role=" + userMapper.findById('u1')?.role
        userMapper.findById('u1')?.role == UserRole.ADMIN
    }

    def "probe 2 - u2 MODERATOR"() {
        given:
        def userMapper = Mock(UserMapper)
        userMapper.findById('u2') >> new User(id: 'u2', username: 'y', role: UserRole.MODERATOR)

        expect:
        println "P2 role=" + userMapper.findById('u2')?.role
        userMapper.findById('u2')?.role == UserRole.MODERATOR
    }
}
