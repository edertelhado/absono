package br.com.absono.message

import org.apache.ibatis.annotations.Mapper
import org.apache.ibatis.annotations.Param

@Mapper
interface MessageMapper {

    List<Message> findByChannelId(@Param('channelId') String channelId, @Param('limit') int limit, @Param('offset') int offset)

    List<Message> searchByChannel(@Param('channelId') String channelId, @Param('query') String query, @Param('limit') int limit)

    Message findById(String id)

    int insert(Message message)

    int updateContent(@Param('id') String id, @Param('content') String content)

    int delete(String id)

    int countByChannelId(String channelId)

    int insertAttachment(MessageAttachment attachment)

    List<MessageAttachment> findAttachmentsByMessageId(String messageId)

    int insertReaction(@Param('id') String id, @Param('messageId') String messageId, @Param('userId') String userId, @Param('emoji') String emoji)

    int deleteReaction(@Param('messageId') String messageId, @Param('userId') String userId, @Param('emoji') String emoji)

    int findByMessageAndUserAndEmoji(@Param('messageId') String messageId, @Param('userId') String userId, @Param('emoji') String emoji)

    List<MessageReaction> findReactionsByMessageId(String messageId)

    void deleteReactionsByMessageId(String messageId)

    MessageAttachment findAttachmentById(String id)

    int deleteAttachment(String id)
}
