-- Adiciona coluna de role global ao usuário
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER';

-- O primeiro usuário registrado torna-se ADMIN
UPDATE users SET role = 'ADMIN'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
