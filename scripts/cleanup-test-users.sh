#!/usr/bin/env bash
# Remove usuários de teste criados pelas suítes E2E/debug (prefixos conhecidos).
# Uso: ./scripts/cleanup-test-users.sh [--yes]
set -euo pipefail

cd "$(dirname "$0")/.."

PREFIXES='^(smoketest|smoke_|alice_|bob_|auth_|refl_|ghost_|dbg_|cam_|shr_|vw_|vz_|vy_|nav_|dsc_|upl_|big_|unr_|watch_|edt_|obs_|real_|chk_hash|usr_test|e2e_)'

PSQL="docker exec absono-postgres psql -U ${POSTGRES_USER:-absono} -d ${POSTGRES_DB:-absono} -t -A"

COUNT=$($PSQL -c "SELECT count(*) FROM users WHERE username ~ '$PREFIXES'")
echo "Usuários de teste encontrados: $COUNT"

if [ "$COUNT" = "0" ]; then
  echo "Nada a limpar."
  exit 0
fi

if [ "${1:-}" != "--yes" ]; then
  read -rp "Apagar $COUNT usuários de teste e seus dados? (y/N) " ans
  [ "$ans" = "y" ] || { echo "Abortado."; exit 1; }
fi

$PSQL << SQL
BEGIN;
CREATE TEMP TABLE tmp_del AS
  SELECT id FROM users WHERE username ~ '$PREFIXES';

DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM messages WHERE user_id IN (SELECT id FROM tmp_del));
DELETE FROM messages WHERE user_id IN (SELECT id FROM tmp_del);
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM tmp_del);
DELETE FROM channel_permissions WHERE user_id IN (SELECT id FROM tmp_del);
DELETE FROM users WHERE id IN (SELECT id FROM tmp_del);
DROP TABLE tmp_del;
COMMIT;
SQL

echo "==> Limpo."
