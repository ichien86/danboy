# Hosting DANBOY di Netlify, database di MongoDB Atlas

Skema: **aplikasi di Netlify** untuk pemakaian sehari-hari, **aplikasi di localhost** untuk pekerjaan berat. Keduanya
memakai database MongoDB Atlas yang sama, sehingga hasil impor dari localhost langsung terlihat di Netlify.

| Dikerjakan dari | Pekerjaan |
| --- | --- |
| **Localhost** | Semua impor (APBD, nomenklatur, perangkat daerah, sumber dana, tagging, rekening) termasuk Terapkan, Proses ulang, dan Tambahkan ke master; Verifikasi SIPD dan Cek ulang; **Buka tahapan** (salin data tahapan sebelumnya) |
| **Netlify** | Semua pekerjaan lain: dasbor, rekap, subkegiatan, matriks, ubah alokasi, isi pagu, perbedaan SIPD, centang pengingat, notifikasi, master tambah/ubah, pengguna, unduh Excel |

Alasannya: Netlify menjalankan aplikasi sebagai fungsi serverless yang dihentikan begitu respons terkirim dan dibatasi
waktu ±10–26 detik, sedangkan impor dan penyalinan tahapan berjalan di latar belakang. Jadwal buka/tutup tahapan otomatis
juga **tidak berjalan di Netlify**; buka dan tutup tahapan dari localhost (tombol Buka sekarang / Tutup), atau biarkan
jadwalnya berjalan saat aplikasi localhost menyala.

Bila sebuah impor tidak sengaja dimulai dari Netlify dan tertahan di status *Diunggah/Diproses*, buka batch itu dari
localhost lalu klik **Proses ulang**.

---

## 1. Siapkan MongoDB Atlas

1. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`). Alamat IP Netlify berubah-ubah,
   sehingga tidak bisa dibatasi per IP; keamanan bergantung pada sandi user database.
2. **Database Access**: pastikan user database memakai sandi kuat dan sandi itu belum pernah dibagikan di tempat lain.
   Ganti sandinya bila pernah tertulis di chat/dokumen (Edit → Edit Password), lalu perbarui `MONGODB_URI` di `.env`
   lokal dan di Netlify.
3. Salin alamat koneksi: **Connect → Drivers**, bentuknya
   `mongodb+srv://<user>:<sandi>@cluster0.xxxx.mongodb.net/danboy?retryWrites=true&w=majority`
   (tambahkan `/danboy` sebelum tanda `?`).

## 2. Buat situs di Netlify

1. Masuk ke <https://app.netlify.com> → **Add new site → Import an existing project → GitHub** → pilih repositori
   `ichien86/danboy`.
2. Isi pengaturan build:

   | Kolom | Isi |
   | --- | --- |
   | Branch to deploy | `main` |
   | Base directory | *(kosong)* |
   | Package directory | `apps/web` |
   | Build command | `pnpm --filter @danboy/web build` (terisi otomatis dari `apps/web/netlify.toml`) |
   | Publish directory | biarkan bawaan (diatur adapter Next.js) |

3. Sebelum **Deploy**, buka **Add environment variables** dan isi:

   | Variabel | Isi |
   | --- | --- |
   | `MONGODB_URI` | alamat Atlas dari langkah 1 |
   | `AUTH_SECRET` | rahasia acak baru, mis. hasil `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `AUTH_URL` | alamat situs, mis. `https://danboy-boyolali.netlify.app` (perbarui bila nama situs/domain berubah) |
   | `AUTH_TRUST_HOST` | `true` |
   | `SANDI_AWAL` | sandi awal akun baru/reset (sama dengan di `.env` lokal, atau kosongkan untuk sandi acak) |
   | `AMBANG_MENDEKATI_PERSEN` | `90` |
   | `UPLOAD_MAX_MB` | `5` (Netlify membatasi ukuran permintaan ±6 MB; impor tetap dari localhost) |
   | `KUNCI_ENKRIPSI`, `KUNCI_SIDIK` | modul Hibah dan Bansos: **sama persis** dengan di `.env` lokal (dibuat sekali dengan `pnpm hibah:seed --kunci`) |
   | `CRON_SECRET` | rahasia acak; dipakai fungsi terjadwal `kirim-berkas` (setiap 5 menit) |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | klien OAuth Google Cloud (Web application); aplikasi OAuth berstatus **In production** |
   | `GOOGLE_REDIRECT_URI` | `https://<situs>.netlify.app/api/hibah/drive/oauth/callback` (daftarkan juga di Google Cloud) |

   Jangan isi `TZ` (dicadangkan oleh lingkungan Netlify); tanggal di aplikasi sudah selalu ditampilkan dalam WIB.
   Jangan isi `REDIS_URL`.

4. Klik **Deploy**. Build pertama ±3–6 menit.

## 3. Periksa

1. Buka `https://<situs>.netlify.app/api/kesehatan`. Harus `"status":"sehat"` dengan `replicaSet` dari Atlas.
2. Masuk dengan akun yang sudah ada di Atlas (mis. `superadmin`).
3. Pastikan data yang diimpor dari localhost terlihat di dasbor/subkegiatan.

Bila login gagal dengan galat server, buka **Netlify → Logs → Functions** dan periksa pesan galatnya (modul login
`@node-rs/argon2` memakai biner bawaan untuk Linux; bila tidak termuat, kabari pengembang).

## 4. Pemakaian sehari-hari

- **Localhost**: `pnpm dev` (atau `pnpm build && pnpm start`) dengan `MONGODB_URI` di `.env` mengarah ke Atlas yang sama.
  Biarkan aplikasi lokal menyala sampai impor selesai.
- **Netlify**: setiap `git push` ke `main` otomatis membangun dan memasang versi baru.
- Nama situs bisa diganti di **Site configuration → Change site name**, atau pasang domain sendiri di **Domain management**.
  Setelah itu ubah `AUTH_URL` lalu **Deploys → Trigger deploy**.

## 5. Modul Hibah dan Bansos

1. Buat kunci sekali: `pnpm hibah:seed --kunci`, lalu salin `KUNCI_ENKRIPSI`, `KUNCI_SIDIK`, dan `CRON_SECRET` ke `.env`
   lokal **dan** ke pengaturan Netlify. Simpan salinannya di tempat aman; tanpa `KUNCI_ENKRIPSI` NIK tidak bisa dibuka lagi.
2. Dari localhost (MONGODB_URI ke Atlas): `pnpm hibah:seed --tahun 2027` memuat master awal (jenis penerima, checklist,
   berkas wajib, tujuan bansos, rekening 5.1.05/5.1.06 dari master DANBOY) dan membuat tahun anggaran aktif.
   Aman dijalankan ulang: hanya menambah yang belum ada.
3. Super Admin membuat akun Admin Perencana dan Verifikator TAPD di **Pengguna** (Akses DANBOY boleh "Tidak ada").
   Akun SKPD otomatis menjadi Operator PD.
4. Admin Perencana mengisi **Tahun dan Jadwal**, **Wilayah** (impor Excel), **Master → Susunan TAPD**,
   **Riwayat Penerima**, lalu menghubungkan **Google Drive** dengan akun Gmail khusus aplikasi.
5. Fungsi terjadwal `apps/web/netlify/functions/kirim-berkas.mts` mengirim ulang berkas yang tertunda ke Drive.
   Periksa **Netlify → Logs → Functions** bila ada berkas yang lama berstatus menunggu.
