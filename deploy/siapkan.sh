#!/usr/bin/env bash
# Pemasangan pertama DANBOY di server Linux dengan Docker.
#   cd /opt/danboy && bash deploy/siapkan.sh https://danboy.boyolali.go.id
# Aman dijalankan ulang: rahasia, keyfile, dan sertifikat yang sudah ada tidak ditimpa.
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN_URL="${1:-}"
VERSI="${VERSI:-$(date +%Y.%m.%d)}"

command -v docker >/dev/null || { echo "Docker belum terpasang. Lihat https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null || { echo "Plugin docker compose belum terpasang."; exit 1; }
acak() { openssl rand -base64 "$1" | tr -d '\n/+=' ; }

if [ ! -f .env ]; then
  [ -n "$DOMAIN_URL" ] || { echo "Pemasangan pertama butuh URL, contoh: bash deploy/siapkan.sh https://danboy.example.go.id"; exit 1; }
  cp .env.example .env
  sed -i \
    -e "s|^VERSI=.*|VERSI=$VERSI|" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(acak 32)|" \
    -e "s|^AUTH_URL=.*|AUTH_URL=$DOMAIN_URL|" \
    -e "s|^MONGO_ROOT_PASSWORD=.*|MONGO_ROOT_PASSWORD=$(acak 24)|" \
    -e "s|^MONGO_APP_PASSWORD=.*|MONGO_APP_PASSWORD=$(acak 24)|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(acak 24)|" \
    -e "s|^TLS_DIR=.*|TLS_DIR=./tls|" \
    .env
  chmod 600 .env
  echo "deploy/.env dibuat dengan rahasia acak (simpan salinannya di tempat aman)."
else
  sed -i "s|^VERSI=.*|VERSI=$VERSI|" .env
fi

if [ ! -f mongo-keyfile ]; then
  openssl rand -base64 756 > mongo-keyfile
  chmod 400 mongo-keyfile
fi

mkdir -p tls
if [ ! -f tls/fullchain.pem ] || [ ! -f tls/privkey.pem ]; then
  HOST=$(grep '^AUTH_URL=' .env | sed -E 's|^AUTH_URL=https?://([^/:]+).*|\1|')
  echo "Sertifikat TLS belum ada: membuat sertifikat self-signed sementara untuk $HOST."
  echo "Ganti dengan sertifikat resmi (mis. Let's Encrypt) di deploy/tls/ lalu: docker compose restart nginx"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=$HOST" \
    -keyout tls/privkey.pem -out tls/fullchain.pem >/dev/null 2>&1
fi

echo "Membangun image versi $VERSI…"
docker build -f Dockerfile --target web -t "danboy-web:$VERSI" ..
docker build -f Dockerfile --target worker -t "danboy-worker:$VERSI" ..

echo "Menjalankan layanan…"
docker compose --env-file .env up -d

echo "Menunggu MongoDB replica set siap…"
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q mongo)")" = "healthy" ] && break
  sleep 3
done

echo "Migrasi indeks…"
docker compose --env-file .env run --rm worker node_modules/.bin/tsx scripts/db-indexes.ts

echo "Akun Super Admin (sandi sementara hanya ditampilkan sekali):"
docker compose --env-file .env run --rm worker node_modules/.bin/tsx scripts/db-seed.ts

echo
echo "Selesai. Buka $(grep '^AUTH_URL=' .env | cut -d= -f2-) dan masuk sebagai superadmin."
echo "Cek kesehatan: curl -k $(grep '^AUTH_URL=' .env | cut -d= -f2-)/api/kesehatan"
