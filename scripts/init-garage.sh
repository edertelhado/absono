#!/usr/bin/env bash
# Inicializa o Garage na VPS: importa a chave de acesso do .env e cria o bucket.
# Uso: ./scripts/init-garage.sh   (após subir compose.prod.yml)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado na raiz do projeto" >&2
  exit 1
fi

GARAGE_ACCESS_KEY=$(grep '^GARAGE_ACCESS_KEY=' .env | cut -d= -f2-)
GARAGE_SECRET_KEY=$(grep '^GARAGE_SECRET_KEY=' .env | cut -d= -f2-)
GARAGE_BUCKET=$(grep '^GARAGE_BUCKET=' .env | cut -d= -f2-)
GARAGE_S3_PORT=$(grep '^GARAGE_S3_PORT=' .env | cut -d= -f2-)
GARAGE_S3_PORT=${GARAGE_S3_PORT:-3902}
CONTAINER=absono-garage

G() {
  docker exec "$CONTAINER" /garage -c /etc/garage.toml "$@"
}

echo "==> Status do cluster Garage"
G status || true

echo "==> Configurando layout do cluster (single node, idempotente)"
NODE_ID=$(G status | grep -oE '\b[0-9a-f]{16}\b' | head -1)
if [ -z "$NODE_ID" ]; then
  echo "ERRO: Node ID não encontrado no 'garage status'" >&2
  exit 1
fi

if G layout assign -z dc1 -c 1G "$NODE_ID" 2>/dev/null; then
  echo "Role do node $NODE_ID preparada."
else
  echo "Role já atribuída."
fi

CUR=$(G layout show 2>/dev/null | sed -nE 's/.*ersion:? ([0-9]+).*/\1/p' | head -1)
CUR=${CUR:-0}
if G layout apply --version $((CUR + 1)) 2>/dev/null; then
  echo "Layout aplicado (v$((CUR + 1)))."
else
  echo "Layout já aplicado (v$CUR), seguindo..."
fi

echo "==> Importando chave de acesso"
if G key import "$GARAGE_ACCESS_KEY" "$GARAGE_SECRET_KEY"; then
  echo "Chave importada."
else
  echo "AVISO: key import falhou acima (ok se for 'already exists')" >&2
fi

echo "==> Criando bucket '$GARAGE_BUCKET'"
G bucket create "$GARAGE_BUCKET" 2>/dev/null || echo "Bucket já existe."

echo "==> Autorizando chave no bucket"
G bucket allow --read --write --owner --key "$GARAGE_ACCESS_KEY" "$GARAGE_BUCKET"

echo "==> Removendo CORS do bucket (CORS é tratado pelo Caddy)"
docker run --rm --network host \
  -e AWS_ACCESS_KEY_ID="$GARAGE_ACCESS_KEY" \
  -e AWS_SECRET_ACCESS_KEY="$GARAGE_SECRET_KEY" \
  amazon/aws-cli:latest \
  --endpoint-url "http://localhost:${GARAGE_S3_PORT}" \
  s3api delete-bucket-cors --bucket "$GARAGE_BUCKET" \
  || echo "AVISO: nenhum CORS para remover (ok)"

echo "==> Verificação final"
echo "--- Chaves:"
G key list || true
echo "--- Buckets:"
G bucket list || true
echo "==> Concluído."
