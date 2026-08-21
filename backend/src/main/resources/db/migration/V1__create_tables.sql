CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id VARCHAR(26) PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    password VARCHAR(128) NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'OFFLINE',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);

CREATE TABLE channels (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('TEXT', 'VOICE', 'VIDEO')),
    description TEXT DEFAULT '',
    "position" INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_by VARCHAR(26) REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_channels_position ON channels("position");

CREATE TABLE messages (
    id VARCHAR(26) PRIMARY KEY,
    channel_id VARCHAR(26) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    reply_to_id VARCHAR(26),
    edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_reply ON messages(reply_to_id);

CREATE TABLE message_attachments (
    id VARCHAR(26) PRIMARY KEY,
    message_id VARCHAR(26) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_attachments_message ON message_attachments(message_id);

CREATE TABLE user_sessions (
    id VARCHAR(26) PRIMARY KEY,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) NOT NULL,
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_refresh ON user_sessions(refresh_token);

CREATE TABLE channel_permissions (
    id VARCHAR(26) PRIMARY KEY,
    channel_id VARCHAR(26) NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id VARCHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT true,
    can_manage BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_permissions_channel ON channel_permissions(channel_id);
CREATE INDEX idx_permissions_user ON channel_permissions(user_id);
