CREATE TABLE invites (
    id VARCHAR(26) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    created_by VARCHAR(26) NOT NULL REFERENCES users(id),
    max_uses INTEGER NOT NULL DEFAULT 1,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invites_code ON invites(code);
