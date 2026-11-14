#!/usr/bin/env bash
# Menyiapkan VM Ubuntu baru (mis. Oracle Cloud Always Free, Ampere A1) untuk DANBOY.
# Jalankan sekali sebagai user biasa yang punya sudo (di Oracle: user "ubuntu"):
#   curl -fsSL https://raw.githubusercontent.com/ichien86/danboy/main/deploy/siapkan-server.sh | bash
# Setelah selesai, LOGOUT lalu login SSH lagi agar grup docker aktif.
set -euo pipefail

echo "== Zona waktu Asia/Jakarta"
sudo timedatectl set-timezone Asia/Jakarta

echo "== Paket dasar dan pembaruan keamanan otomatis"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git curl openssl cron unattended-upgrades iptables-persistent
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "== Firewall OS: buka port 80 dan 443"
# Image Ubuntu Oracle memakai iptables dengan aturan REJECT di akhir chain INPUT; sisipkan ACCEPT sebelumnya.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    pos=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    sudo iptables -I INPUT "${pos:-1}" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "== Folder aplikasi dan cadangan"
sudo mkdir -p /opt/danboy /opt/danboy-cadangan
sudo chown "$USER":"$USER" /opt/danboy /opt/danboy-cadangan

echo
echo "Server siap. Langkah berikutnya:"
echo "  1. logout, lalu login SSH lagi"
echo "  2. git clone https://github.com/ichien86/danboy.git /opt/danboy"
echo "  3. cd /opt/danboy && bash deploy/siapkan.sh https://<domain-anda>"
