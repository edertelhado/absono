-- Unifica canais de mídia: VIDEO passa a ser VOICE (voz + vídeo no mesmo tipo)
UPDATE channels SET type = 'VOICE' WHERE type = 'VIDEO';

ALTER TABLE channels DROP CONSTRAINT channels_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_type_check CHECK (type IN ('TEXT', 'VOICE'));
