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
CONTAINER=absono-garage

G() {
  docker exec "$CONTAINER" /garage -c /etc/garage.toml "$@"
}

echo "==> Status do cluster Garage"
G status || true

echo "==> Importando chave de acesso"
if G key import absono-app "$GARAGE_ACCESS_KEY" "$GARAGE_SECRET_KEY" 2>/dev/null; then
  echo "Chave importada."
else
  echo "Chave já existe (ou falha ao importar), seguindo..."
fi

echo "==> Criando bucket '$GARAGE_BUCKET'"
G bucket create "$GARAGE_BUCKET" 2>/dev/null || echo "Bucket já existe."

echo "==> Autorizando chave no bucket"
G bucket allow --read --write --owner --key "$GARAGE_ACCESS_KEY" "$GARAGE_BUCKET"

echo "==> Concluído. Resumo:"
G key info "$GARAGE_ACCESS_KEY" || true
