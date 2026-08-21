package br.com.absono.user

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface UserMapper {

    User findById(String id)

    User findByUsername(String username)

    int insert(@Param('id') String id, @Param('username') String username, @Param('displayName') String displayName, @Param('password') String password)

    int updateProfile(@Param('id') String id, @Param('displayName') String displayName, @Param('bio') String bio, @Param('avatarUrl') String avatarUrl)

    int updateStatus(@Param('id') String id, @Param('status') String status)

    int updateRole(@Param('id') String id, @Param('role') String role)

    List<User> findAll()

    List<User> search(@Param('search') String search, @Param('limit') int limit)
}
