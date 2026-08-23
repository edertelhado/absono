-- Threads encadeadas: respostas de uma mensagem ficam com parent_message_id
ALTER TABLE messages ADD COLUMN parent_message_id VARCHAR(26) REFERENCES messages(id) ON DELETE CASCADE;

CREATE INDEX idx_messages_parent ON messages(parent_message_id);
