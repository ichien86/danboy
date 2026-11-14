# Hosting DANBOY di Oracle Cloud Always Free

Panduan ini memasang DANBOY lengkap (Nginx, web, worker, Redis, MongoDB) di satu VM gratis Oracle Cloud,
dengan alamat HTTPS gratis. Perkiraan waktu: 45–60 menit, sebagian besar menunggu.

Yang dibutuhkan:

- Akun Oracle Cloud (butuh kartu kredit/debit untuk verifikasi; layanan Always Free tidak ditagih).
- Komputer dengan terminal SSH (Windows 10/11 sudah punya `ssh` di PowerShell).
- Subdomain gratis dari [DuckDNS](https://www.duckdns.org) (atau domain milik sendiri).

> Data APBD adalah data pemda. Pakai hosting gratis ini untuk uji coba/demo, dan pastikan aturan penyimpanan data di
> instansi Anda sebelum dipakai resmi. Skrip yang sama bisa dipakai nanti di server pemda.

---

## 1. Buat akun dan VM

1. Daftar di <https://www.oracle.com/cloud/free/>. Saat memilih **Home Region**, pilih yang terdekat (mis. Singapore).
   Region utama tidak bisa diganti, dan sumber daya gratis hanya tersedia di region itu.
2. Di konsol: **Menu ☰ → Compute → Instances → Create instance**.
3. Isi:
   - **Name**: `danboy`
   - **Image**: klik *Change image* → **Canonical Ubuntu 24.04** (atau 22.04).
   - **Shape**: klik *Change shape* → **Ampere** → `VM.Standard.A1.Flex`, **4 OCPU, 24 GB memory**
     (semuanya masih dalam jatah Always Free). Kalau muncul *Out of capacity*, coba 2 OCPU / 12 GB atau ulangi beberapa jam lagi.
   - **Networking**: biarkan bawaan (VCN baru, subnet publik, *Assign a public IPv4 address* aktif).
   - **Add SSH keys**: pilih *Generate a key pair for me*, lalu **Save private key** (simpan baik-baik, mis. `C:\Users\<anda>\.ssh\danboy.key`).
   - **Boot volume**: centang *Specify a custom boot volume size*, isi **100 GB** (jatah gratis total 200 GB).
4. Klik **Create**, tunggu status **Running**, lalu catat **Public IP address**.

## 2. Buka port 80 dan 443 di jaringan Oracle

1. Di halaman instance, klik nama **Subnet** → **Security Lists** → **Default Security List**.
2. **Add Ingress Rules**, buat dua aturan:

   | Source CIDR | IP Protocol | Destination Port |
   | --- | --- | --- |
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

(Firewall di dalam Ubuntu dibuka otomatis oleh skrip pada langkah 4.)

## 3. Subdomain gratis

1. Masuk ke <https://www.duckdns.org> (login dengan akun GitHub/Google).
2. Buat subdomain, misalnya `danboy-boyolali` → menjadi `danboy-boyolali.duckdns.org`.
3. Isi kolom **current ip** dengan Public IP VM, klik **update ip**.

## 4. Siapkan server

Dari PowerShell di komputer Anda:

```powershell
ssh -i C:\Users\<anda>\.ssh\danboy.key ubuntu@<PUBLIC_IP>
```

(Bila muncul peringatan izin kunci di Windows, jalankan sekali:
`icacls C:\Users\<anda>\.ssh\danboy.key /inheritance:r /grant:r "$($env:USERNAME):R"`.)

Di dalam server:

```bash
curl -fsSL https://raw.githubusercontent.com/ichien86/danboy/main/deploy/siapkan-server.sh | bash
exit
```

Skrip ini memasang Docker, git, pembaruan keamanan otomatis, membuka port 80/443 di firewall Ubuntu, dan mengatur zona waktu WIB.
**Wajib logout** (`exit`) lalu login SSH lagi agar akses Docker aktif.

## 5. Pasang DANBOY

Login SSH lagi, lalu:

```bash
git clone https://github.com/ichien86/danboy.git /opt/danboy
cd /opt/danboy
bash deploy/siapkan.sh https://danboy-boyolali.duckdns.org
```

Pembuatan image pertama butuh sekitar 10–20 menit. Di akhir, skrip mencetak:

```
Akun Super Admin dibuat.
  username : superadmin
  sandi    : xxxxxxxxxxxxxx   (wajib diganti saat masuk pertama)
```

**Catat sandi itu**; hanya ditampilkan sekali. Rahasia lain (sandi MongoDB, Redis, AUTH_SECRET) tersimpan di
`/opt/danboy/deploy/.env`; simpan salinannya di tempat aman.

## 6. HTTPS resmi (Let's Encrypt)

```bash
cd /opt/danboy
bash deploy/sertifikat.sh danboy-boyolali.duckdns.org email-anda@contoh.go.id
```

Sertifikat diperpanjang otomatis setiap hari pukul 03.30 (bila sudah mendekati kedaluwarsa).

## 7. Mulai memakai

Buka `https://danboy-boyolali.duckdns.org`, masuk sebagai `superadmin`, ganti sandi, lalu:

1. **Pengaturan → Tahun & Tahapan**: buat tahun dan tahapan.
2. **Impor**: master sumber dana → nomenklatur → tagging → rincian APBD dari SIPD.
3. **Pengaturan → Pengguna**: buat akun Admin dan akun SKPD.

---

## Perawatan

| Keperluan | Perintah (di `/opt/danboy`) |
| --- | --- |
| Pasang versi terbaru dari GitHub | `git pull && bash deploy/perbarui.sh` |
| Lihat status layanan | `docker compose -f deploy/docker-compose.yml ps` |
| Lihat log web / worker | `docker compose -f deploy/docker-compose.yml logs -f --tail 100 web worker` |
| Cek kesehatan | `curl -s https://<domain>/api/kesehatan` |
| Cadangan manual | `bash deploy/cadangan.sh` |
| Mulai ulang semua | `docker compose -f deploy/docker-compose.yml restart` |

Cadangan MongoDB berjalan otomatis setiap hari 01.00 WIB ke `/opt/danboy-cadangan` dan disimpan 30 hari. Cadangan di VM yang
sama tidak melindungi dari hilangnya VM; unduh sesekali ke komputer lain, misalnya:

```powershell
scp -i C:\Users\<anda>\.ssh\danboy.key "ubuntu@<PUBLIC_IP>:/opt/danboy-cadangan/*.archive.gz" D:\cadangan-danboy\
```

**Pulihkan dari cadangan:**

```bash
cd /opt/danboy/deploy && source .env
docker compose exec -T mongo mongorestore --oplogReplay --gzip --archive --drop \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin < /opt/danboy-cadangan/<file>.archive.gz
```

## Kendala umum

- **Situs tidak bisa dibuka**: pastikan langkah 2 (Security List) sudah dibuat, DuckDNS menunjuk ke IP yang benar, dan
  `docker compose -f deploy/docker-compose.yml ps` menunjukkan semua layanan `running`/`healthy`.
- **`permission denied ... docker.sock`**: Anda belum logout–login setelah langkah 4.
- **Sertifikat gagal terbit**: port 80 harus terbuka dari internet dan domain sudah mengarah ke IP VM
  (cek: `nslookup danboy-boyolali.duckdns.org`).
- **VM dihentikan Oracle karena tidak aktif**: akun Always Free kadang mereklamasi instance yang sangat jarang dipakai.
  Upgrade akun ke *Pay As You Go* (tetap gratis selama dalam batas Always Free) untuk menghindarinya.
