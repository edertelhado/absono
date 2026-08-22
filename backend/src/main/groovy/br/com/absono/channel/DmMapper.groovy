package br.com.absono.channel

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface DmMapper {

    Map<String, Object> findByChannelId(@Param('channelId') String channelId, @Param('me') String me)

    Map<String, Object> findByPair(@Param('a') String a, @Param('b') String b)

    int insert(@Param('channelId') String channelId, @Param('a') String a, @Param('b') String b)

    List<Map<String, Object>> listForUser(@Param('userId') String userId)
}
