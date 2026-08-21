package br.com.absono.channel

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface ChannelMapper {

    List<Channel> findAll()

    Channel findById(String id)

    Channel findByName(String name)

    int insert(Channel channel)

    int update(Channel channel)

    int delete(String id)

    Integer getMaxPosition()

    int updatePosition(@Param('id') String id, @Param('position') int position)
}
