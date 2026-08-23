package br.com.absono.invite

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface InviteMapper {

    Invite findByCode(@Param('code') String code)

    int insert(@Param('id') String id, @Param('code') String code, @Param('createdBy') String createdBy,
               @Param('maxUses') int maxUses, @Param('expiresAt') String expiresAt)

    int incrementUseCount(@Param('code') String code)

    List<Invite> findByCreatedBy(@Param('createdBy') String createdBy)

    int deleteById(@Param('id') String id)

    int deleteExpired()
}
