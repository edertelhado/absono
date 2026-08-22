ALTER TABLE channels DROP CONSTRAINT channels_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_type_check CHECK (type IN ('TEXT', 'VOICE', 'DIRECT'));

CREATE TABLE dm_channels (
    channel_id VARCHAR(26) PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
    user_a     VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b     VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dm_pair UNIQUE (user_a, user_b)
);

CREATE INDEX idx_dm_user_a ON dm_channels(user_a);
CREATE INDEX idx_dm_user_b ON dm_channels(user_b);
