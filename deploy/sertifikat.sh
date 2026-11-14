#!/usr/bin/env bash
# Sertifikat HTTPS gratis dari Let's Encrypt (lewat image certbot, tanpa memasang certbot di server).
#   Terbit pertama : bash deploy/sertifikat.sh danboy.duckdns.org [email-untuk-pemberitahuan]
#   Perpanjang     : bash deploy/sertifikat.sh --perpanjang      (dipasang otomatis di cron, tiap hari 03.30)
# Nginx dihentikan beberapa detik selama certbot memakai port 80.
set -euo pipefail
cd "$(dirname "$0")"
LE="$PWD/letsencrypt"
mkdir -p "$LE" tls

certbot() { docker run --rm -p 80:80 -v "$LE:/etc/letsencrypt" certbot/certbot "$@"; }
salin() {
  local domain
  domain=$(cat "$LE/domain")
  docker run --rm -v "$LE:/etc/letsencrypt" -v "$PWD/tls:/tls" --entrypoint sh certbot/certbot -c \
    "cp -L /etc/letsencrypt/live/$domain/fullchain.pem /etc/letsencrypt/live/$domain/privkey.pem /tls/ && chmod 644 /tls/fullchain.pem && chmod 600 /tls/privkey.pem"
}

if [ "${1:-}" = "--perpanjang" ]; then
  [ -f "$LE/domain" ] || { echo "Belum ada sertifikat; jalankan dulu: bash deploy/sertifikat.sh <domain>"; exit 1; }
  docker compose stop nginx
  certbot renew --standalone --non-interactive || true
  salin
  docker compose start nginx
  exit 0
fi

DOMAIN="${1:?Pakai: bash deploy/sertifikat.sh <domain> [email]}"
EMAIL="${2:-}"
echo "$DOMAIN" > "$LE/domain"
docker compose stop nginx 2>/dev/null || true
if [ -n "$EMAIL" ]; then akun=(--email "$EMAIL"); else akun=(--register-unsafely-without-email); fi
certbot certonly --standalone --non-interactive --agree-tos "${akun[@]}" -d "$DOMAIN"
salin
docker compose start nginx 2>/dev/null || docker compose --env-file .env up -d nginx

# perpanjang otomatis
BARIS="30 3 * * * cd $PWD && bash sertifikat.sh --perpanjang >> $PWD/sertifikat.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'sertifikat.sh --perpanjang' ; echo "$BARIS" ) | crontab -
echo "Sertifikat untuk $DOMAIN terpasang; perpanjangan otomatis dijadwalkan tiap hari 03.30."
