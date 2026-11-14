#!/usr/bin/env bash
# Rilis versi baru tanpa jeda layanan berarti: build image, migrasi indeks, perbarui worker lalu web.
#   cd /opt/danboy && git pull && bash deploy/perbarui.sh
# Rollback: VERSI=<versi-lama> docker compose --env-file .env up -d   (versi lama ada di `docker images danboy-web`)
set -euo pipefail
cd "$(dirname "$0")"
VERSI="${VERSI:-$(date +%Y.%m.%d-%H%M)}"
docker build -f Dockerfile --target web -t "danboy-web:$VERSI" ..
docker build -f Dockerfile --target worker -t "danboy-worker:$VERSI" ..
bash cadangan.sh || echo "Peringatan: cadangan gagal, periksa TUJUAN_CADANGAN"
sed -i "s|^VERSI=.*|VERSI=$VERSI|" .env
docker compose --env-file .env run --rm worker node_modules/.bin/tsx scripts/db-indexes.ts
docker compose --env-file .env up -d --no-deps worker
docker compose --env-file .env up -d --no-deps web
docker compose --env-file .env restart nginx
echo "Versi $VERSI berjalan."
