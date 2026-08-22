CREATE TABLE message_reactions (
    id         VARCHAR(26) PRIMARY KEY,
    message_id VARCHAR(26) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reactions_message ON message_reactions(message_id);

ALTER TABLE message_reactions
    ADD CONSTRAINT uq_reaction UNIQUE (message_id, user_id, emoji);
