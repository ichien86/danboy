# DANBOY

Pemantauan sumber dana APBD per tahapan (KUA-PPAS, RAPBD, APBD, Pergeseran, Perubahan), dibangun sesuai dokumen **TDD DANBOY**.
Data anggaran berasal dari rincian APBD ekspor SIPD; Admin memutuskan perbedaan sumber dana, mengisi pagu sumber dana sebagai batas pemantauan,
dan sistem menandai pelanggaran aturan R1–R10 sebagai notifikasi.

## Struktur

```
apps/web        Next.js 15 (App Router): halaman, route handler REST /api, Auth.js
apps/worker     Worker BullMQ: impor, salin tahapan, cron jadwal tahapan
packages/core   Logika bisnis: pembanding R1–R10, rekap, normalisasi kode, akses (murni) + services/jobs (DB)
packages/db     Koneksi, 16 model Mongoose, plugin audit, GridFS
packages/schema Skema Zod bersama (form, API, impor)
packages/excel  Pembaca streaming .xlsx/.csv dan ekspor .xlsx
tests/          Fixture dan uji integrasi
deploy/         Docker Compose, Nginx, Dockerfile, skrip cadangan
```

## Menjalankan di komputer lokal (tanpa Docker)

Butuh Node.js 22+ dan pnpm 9 (`npx pnpm@9.15.0 …` juga bisa).

```bash
pnpm install
cp .env.example .env              # isi AUTH_SECRET: openssl rand -base64 32

pnpm dev:db                       # terminal 1: MongoDB replica set lokal (data di .data/mongo)
pnpm db:seed --contoh             # sekali: akun superadmin + data contoh 2027 (sandi dicetak di layar)
pnpm dev                          # terminal 2: http://localhost:3000
```

Tanpa `REDIS_URL`, pekerjaan berat (impor, salin tahapan, cron jadwal) dijalankan in-process oleh web dengan konkurensi 1.
Dengan Redis, isi `REDIS_URL` lalu jalankan `pnpm dev:worker`.

`SEED_USERNAME` dan `SEED_PASSWORD` bisa diatur untuk seed; tanpa itu sandi sementara acak dicetak sekali.

## Akun dan sandi awal

Akun baru dan reset sandi memakai **sandi awal**. Bila `SANDI_AWAL` diisi di `.env` (mis. `SANDI_AWAL=…`), semua akun
baru/reset memakai sandi itu; bila kosong, dibuat sandi acak per akun yang ditampilkan sekali. Apa pun pilihannya, pengguna
**wajib mengganti sandi saat masuk pertama**, dan sandi baru harus berbeda dari sandi awal serta memenuhi syarat sandi.
Jangan menulis sandi awal di kode atau dokumen repositori (repositori ini publik); simpan hanya di `.env` server.
Karena sandi awal yang tetap bisa diketahui orang lain, minta pengguna segera masuk dan mengganti sandinya setelah akun
dibuat atau direset. Lupa sandi Super Admin: `pnpm akun:reset superadmin`.

## Database MongoDB

Semua data (master, anggaran per tahapan, file unggahan di GridFS, notifikasi, log audit) disimpan di MongoDB, database
`danboy`. Pengaturannya satu tempat: `MONGODB_URI` di `.env` akar repositori.

| Pilihan | `MONGODB_URI` |
| --- | --- |
| MongoDB pengembangan (`pnpm dev:db`) | `mongodb://127.0.0.1:27017/danboy?replicaSet=rs0` |
| MongoDB Atlas | `mongodb+srv://<user>:<sandi>@<cluster>.mongodb.net/danboy?retryWrites=true&w=majority` |
| MongoDB terpasang sendiri | `mongodb://<host>:27017/danboy?replicaSet=rs0` |

MongoDB **wajib replica set**, karena impor, salin tahapan, dan keputusan Admin memakai transaksi. Atlas sudah replica set.
MongoDB yang dipasang sendiri (Windows/Linux) perlu dijalankan dengan `replication.replSetName: rs0` di `mongod.cfg`, lalu
sekali `mongosh --eval "rs.initiate()"`. Bila URI tidak menyebut nama database, aplikasi memakai `danboy`
(atau isi `MONGODB_DB`). Cek koneksi dan replica set di `GET /api/kesehatan`.

**Memindahkan data yang sudah ada** ke MongoDB lain (asal tidak diubah; file unggahan dan log audit ikut; indeks dipasang):

```bash
pnpm data:pindah --ke "mongodb+srv://<user>:<sandi>@<cluster>.mongodb.net/danboy"
# asal bawaan = MONGODB_URI di .env; tambahkan --timpa bila database tujuan sudah berisi
```

Setelah itu ganti `MONGODB_URI` di `.env` ke alamat tujuan dan jalankan ulang aplikasi. Untuk melihat isi database secara
langsung, sambungkan MongoDB Compass ke alamat yang sama (untuk MongoDB pengembangan:
`mongodb://127.0.0.1:27017/?directConnection=true`).

## Uji

```bash
pnpm test        # unit (pembanding, akses, kode, rekap, parser) + integrasi (mongodb-memory-server replica set)
pnpm typecheck
```

Uji integrasi mencakup uji wajib Bagian 15: total pagu rekap sama persis dengan kolom PAGU, impor ulang file yang sama nol operasi,
kegagalan di tengah job terapkan meninggalkan data utuh, akun SKPD tidak bisa membaca/mengubah data SKPD lain, dan mutasi pada
tahapan ditutup selalu ditolak 423.

## Produksi (Docker Compose)

**Kebutuhan server:** Linux (mis. Ubuntu 22.04/24.04), minimal 4 vCPU, 8 GB RAM, 100 GB SSD, Docker Engine + plugin
`docker compose`, port 80/443 terbuka, dan nama domain yang mengarah ke server. Image `mongo:8.0` butuh CPU dengan AVX;
pada server lama tanpa AVX, ganti ke `mongo:4.4` di `deploy/docker-compose.yml`.

Panduan lengkap hosting gratis di Oracle Cloud (membuat VM, subdomain, HTTPS): [deploy/HOSTING-ORACLE.md](deploy/HOSTING-ORACLE.md).

**Pemasangan pertama** (database dimulai kosong; data contoh di komputer pengembangan tidak ikut):

```bash
git clone https://github.com/ichien86/danboy.git /opt/danboy
cd /opt/danboy
bash deploy/siapkan.sh https://danboy.boyolali.go.id
```

Skrip itu membuat `deploy/.env` berisi rahasia acak, keyfile MongoDB, sertifikat self-signed sementara, membangun image web
dan worker, menjalankan kelima layanan, migrasi indeks, lalu membuat akun `superadmin` dan mencetak sandi sementaranya.
Ganti sertifikat sementara dengan sertifikat resmi, misalnya Let's Encrypt:

```bash
sudo certbot certonly --standalone -d danboy.boyolali.go.id   # hentikan nginx sebentar: docker compose -f deploy/docker-compose.yml stop nginx
cp /etc/letsencrypt/live/danboy.boyolali.go.id/{fullchain,privkey}.pem deploy/tls/
docker compose -f deploy/docker-compose.yml restart nginx
```

Setelah masuk: ganti sandi, buat tahun/tahapan, impor master sumber dana, nomenklatur, tagging, lalu rincian APBD dari SIPD.

**Rilis berikutnya:** `git pull && bash deploy/perbarui.sh` (cadangan → build → migrasi indeks → ganti worker lalu web).
Rollback: `VERSI=<versi-lama> docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d`.

**Cadangan harian:** `deploy/cadangan.sh` lewat cron 01.00 WIB (`0 1 * * * /opt/danboy/deploy/cadangan.sh`), disimpan 30 hari
di `TUJUAN_CADANGAN`. **Pemantauan:** `GET /api/kesehatan` (MongoDB, Redis, antrean).

## Alur kerja singkat

1. **Pengaturan → Tahun & Tahapan** (Super Admin): buat tahun dan tahapan beserta jadwal. Tahapan dibuka otomatis saat jadwal mulai
   tiba; data tahapan sebelumnya disalin dalam satu transaksi.
2. **Isi data master dan APBD.** Impor menyatu dengan halaman pengelolaan datanya; setiap halaman punya tombol impor, tambah, ubah,
   dan riwayat impornya sendiri. Setiap impor berhenti di pratinjau; data baru berubah setelah **Terapkan**.

   | Halaman | Isi | Kewenangan |
   | --- | --- | --- |
   | Master → Nomenklatur | impor dari SIPD, tambah, ubah, nonaktifkan | Super Admin |
   | Master → Perangkat Daerah | impor, tambah, ubah SKPD & sub unit (terpisah dari impor APBD) | Super Admin |
   | Master → Sumber Dana | impor sumber dana, impor tagging, tambah, ubah | Admin Keuangan (dan Super Admin) |
   | Master → Rekening | impor, tambah, ubah | Admin Keuangan (dan Super Admin) |
   | Subkegiatan | impor rincian APBD dari SIPD ke tahapan aktif | Admin Keuangan (dan Super Admin) |
   **Keterhubungan data saat impor APBD.** Impor APBD tidak membuat data master apa pun. Baris yang merujuk subkegiatan,
   sumber dana, SKPD, atau sub unit yang belum ada di master **ditahan** dan dikelompokkan di pratinjau. Pengelola master
   yang berwenang dapat menekan **Tambahkan ke master** (memakai kode & nama dari file; untuk subkegiatan beserta induknya),
   lalu impor diproses ulang otomatis. Menerapkan impor yang masih punya baris ditahan meminta konfirmasi terlebih dulu.
   Nama SKPD/sub unit di SIPD yang berbeda dengan master tidak menghentikan impor (data ditautkan menurut kode), tetapi
   muncul sebagai peringatan di pratinjau dan di Notifikasi.

3. **Rekap Sumber Dana → Isi pagu sumber dana**. Pelanggaran pagu tidak mengunci, hanya memicu R3.
4. **Perbedaan SIPD**: putuskan Ikut SIPD atau Edit Sendiri. Keputusan diingat sampai komposisi SIPD berubah lagi.
5. **Subkegiatan / Matriks**: lihat dan ubah alokasi (Admin). Ctrl+K untuk mencari subkegiatan.
6. **Verifikasi SIPD**: unggah ekspor rincian APBD dari SIPD untuk mengecek apakah sumber dana yang diinput SKPD di SIPD sudah sama
   dengan alokasi di aplikasi (aplikasi = acuan). Tidak mengubah data apa pun dan boleh terhadap tahapan yang sudah ditutup.
   Hasil per subkegiatan: *sesuai*, *nilai per sumber dana berbeda*, *sumber dana berbeda* (beserta baris rekening SIPD yang memakai
   sumber dana yang tidak dialokasikan), *ada di aplikasi tapi tidak di SIPD*, dan *ada di SIPD tapi tidak di aplikasi*.
   Setiap SKPD yang belum sesuai mendapat notifikasi `VS` yang membuka daftar subkegiatan miliknya yang belum sama sumber dananya.
   SKPD mencentang **"Sudah disesuaikan di SIPD"** setelah memperbaiki SIPD; daftar "belum" berkurang, jumlah di notifikasi ikut
   berkurang, dan notifikasi tertutup sendiri bila semua sudah dicentang. Centang hanya pengingat (disimpan di MongoDB pada
   `hasilBanding.tindakLanjut` beserta siapa dan kapan, dan dicatat di log audit); kepastiannya dicek oleh verifikasi berikutnya
   dengan ekspor SIPD terbaru. Admin melihat progres centang per SKPD dan tetap bisa mengunduh Excel. "Cek ulang" memeriksa file
   yang sama terhadap alokasi terbaru dan mempertahankan centang yang temuannya tidak berubah.

### Jenis notifikasi

| Nama di aplikasi | Kode | Arti |
| --- | --- | --- |
| Input SIPD belum sesuai | VS | Hasil Verifikasi SIPD: sumber dana yang diinput SKPD di SIPD belum sama dengan alokasi di aplikasi |
| Sumber dana beda dengan SIPD | R2 | Komposisi sumber dana di SIPD berbeda dengan yang tersimpan; putuskan di menu Perbedaan SIPD |
| Pagu sumber dana terlampaui | R3 | Jumlah alokasi suatu sumber dana melebihi pagu sumber dana |
| Alokasi belum seimbang | R4 | Jumlah alokasi sumber dana suatu subkegiatan belum sama dengan pagunya |
| Di luar daftar tagging | R5 | Subkegiatan didanai sumber dana khusus tetapi tidak ada di daftar tagging |
| Hilang dari SIPD | R8 | Subkegiatan ada di aplikasi tetapi tidak ada lagi di impor SIPD terakhir |
| Belum ada di master | R9 | Impor merujuk subkegiatan/sumber dana/SKPD/sub unit yang belum ada di master |
| Nama perangkat daerah berbeda | PD | Nama SKPD/sub unit di SIPD berbeda dengan master |

### Pintasan keyboard

- `/` — langsung ke kotak cari di halaman (Subkegiatan, Matriks, Perbedaan, Master, hasil verifikasi). Di halaman tanpa kotak cari, membuka pencarian cepat.
- `Ctrl+K` — pencarian cepat subkegiatan dari halaman mana pun.

## Penyimpangan dari TDD (sengaja, untuk dicatat)

- Data klien memakai Server Components + `router.refresh()` setelah mutasi, belum TanStack Query/Table dan React Hook Form; validasi
  klien tetap memakai skema Zod yang sama dari `packages/schema`.
- `mongoose.sanitizeFilter` tidak diaktifkan global karena mematahkan kueri operator milik aplikasi; perlindungan injeksi NoSQL
  berasal dari validasi Zod yang ketat (objek `$…` ditolak sebagai bukan string) dan `strictQuery`.
- CSP memakai `'unsafe-inline'` untuk skrip karena Next.js menyisipkan skrip hidrasi inline; nonce per permintaan bisa ditambahkan nanti.
- Belum ada: uji end-to-end Playwright, Bull Board di `/admin/antrean`, TOTP, virtualisasi baris matriks (matriks memakai paginasi 100 baris).
- Field tambahan pada `SubkegiatanTahapan`: `namaSubkegiatan` dan `alokasiSipd` (komposisi SIPD utuh, dibutuhkan aksi Ikut SIPD);
  pada `HasilBanding`: `operasi` (yang diterapkan saat Terapkan, dengan pemeriksaan versi agar edit Admin setelah pratinjau tidak tertimpa).
