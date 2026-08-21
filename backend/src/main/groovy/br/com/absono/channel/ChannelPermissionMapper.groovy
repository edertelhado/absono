package br.com.absono.channel

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface ChannelPermissionMapper {

    List<ChannelPermission> findByChannelId(String channelId)

    List<ChannelPermission> findByUserId(@Param('channelId') String channelId, @Param('userId') String userId)

    ChannelPermission findByChannelAndUser(@Param('channelId') String channelId, @Param('userId') String userId)

    int insert(ChannelPermission permission)

    int update(ChannelPermission permission)

    int deleteByChannelAndUser(@Param('channelId') String channelId, @Param('userId') String userId)
}
