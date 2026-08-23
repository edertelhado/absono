package br.com.absono.channel

import br.com.absono.user.User
import br.com.absono.user.UserMapper
import br.com.absono.user.UserRole
import spock.lang.Specification

/**
 * Tudo é instanciado dentro de cada feature para garantir isolamento total
 * entre testes (sem estado vazando através dos campos da especificação).
 */
class ChannelPermissionServiceSpec extends Specification {

    private static User user(String id, UserRole role) {
        new User(id: id, username: id, role: role)
    }

    def "ADMIN tem acesso total"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u1') >> user('u1', UserRole.ADMIN)

        when:
        def perms = service.getEffectivePermissions('c1', 'u1')

        then:
        perms.canRead && perms.canWrite && perms.canManage
    }

    def "MODERATOR tem acesso total"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u2') >> user('u2', UserRole.MODERATOR)
        channelMapper.findById('c1') >> new Channel(id: 'c1', createdBy: 'outro')

        when:
        def perms = service.getEffectivePermissions('c1', 'u2')

        then:
        perms.canRead && perms.canWrite && perms.canManage
    }

    def "criador do canal pode gerenciar"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u3') >> user('u3', UserRole.USER)
        channelMapper.findById('c1') >> new Channel(id: 'c1', createdBy: 'u3')

        when:
        def perms = service.getEffectivePermissions('c1', 'u3')

        then:
        perms.canRead && perms.canWrite && perms.canManage
    }

    def "canal aberto (sem overrides) permite ler e escrever, não gerenciar"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u4') >> user('u4', UserRole.USER)
        channelMapper.findById('c1') >> new Channel(id: 'c1', createdBy: 'outro')
        permissionMapper.findByChannelId('c1') >> []

        when:
        def perms = service.getEffectivePermissions('c1', 'u4')

        then:
        perms.canRead && perms.canWrite
        !perms.canManage
    }

    def "canal restrito sem override bloqueia tudo"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u5') >> user('u5', UserRole.USER)
        channelMapper.findById('c1') >> new Channel(id: 'c1', createdBy: 'outro')
        permissionMapper.findByChannelId('c1') >> [new ChannelPermission()]
        permissionMapper.findByChannelAndUser('c1', 'u5') >> null

        when:
        def perms = service.getEffectivePermissions('c1', 'u5')

        then:
        !perms.canRead && !perms.canWrite && !perms.canManage
    }

    def "canal restrito com override respeita os flags"() {
        given:
        def userMapper = Mock(UserMapper)
        def channelMapper = Mock(ChannelMapper)
        def permissionMapper = Mock(ChannelPermissionMapper)
        def dmService = Mock(DmService)
        def service = new ChannelPermissionService(permissionMapper, userMapper, channelMapper, dmService)

        userMapper.findById('u6') >> user('u6', UserRole.USER)
        channelMapper.findById('c1') >> new Channel(id: 'c1', createdBy: 'outro')
        permissionMapper.findByChannelId('c1') >> [new ChannelPermission()]
        permissionMapper.findByChannelAndUser('c1', 'u6') >>
            new ChannelPermission(canRead: true, canWrite: false, canManage: false)

        when:
        def perms = service.getEffectivePermissions('c1', 'u6')

        then:
        perms.canRead
        !perms.canWrite
        !perms.canManage
    }
}
