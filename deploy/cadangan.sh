#!/usr/bin/env bash
# Cadangan harian MongoDB (cron 01.00 WIB):  0 1 * * * /opt/danboy/deploy/cadangan.sh
# Menyimpan arsip mongodump --oplog ke TUJUAN (NAS/penyimpanan kantor) dan menyimpan 30 hari terakhir.
set -euo pipefail
cd "$(dirname "$0")"
source .env
TUJUAN="${TUJUAN_CADANGAN:-/mnt/nas/danboy}"
NAMA="danboy-$(date +%Y%m%d-%H%M).archive.gz"
mkdir -p "$TUJUAN"
docker compose exec -T mongo mongodump --oplog --gzip --archive \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin > "$TUJUAN/$NAMA"
find "$TUJUAN" -name 'danboy-*.archive.gz' -mtime +30 -delete
echo "Cadangan tersimpan: $TUJUAN/$NAMA"
# Pemulihan (uji bulanan ke staging):
#   docker compose exec -T mongo mongorestore --oplogReplay --gzip --archive --drop -u ... -p ... --authenticationDatabase admin < arsip
