import { Galat } from '../galat';

/*
 * Aturan bisnis murni modul Hibah dan Bansos (TDD bagian Aturan Bisnis dan Mesin Status).
 * Tanpa basis data, agar bisa diuji unit; layanan memanggil fungsi-fungsi ini sebelum menyimpan.
 */

export type StatusUsulan =
  | 'draf' | 'evaluasi' | 'layak' | 'tidak_layak' | 'dalam_rekomendasi' | 'rekomendasi_diunggah' | 'perbaikan' | 'disetujui' | 'ditolak';
export type TahapanHibah = 'input' | 'evaluasi' | 'verifikasi' | 'perbaikan' | 'penetapan';

export const LABEL_STATUS_USULAN: Record<StatusUsulan, string> = {
  draf: 'Draf',
  evaluasi: 'Evaluasi PD',
  layak: 'Layak',
  tidak_layak: 'Tidak layak',
  dalam_rekomendasi: 'Dalam rekomendasi',
  rekomendasi_diunggah: 'Rekomendasi diunggah',
  perbaikan: 'Perbaikan',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
};

export const LABEL_TAHAPAN_HIBAH: Record<TahapanHibah, string> = {
  input: 'Input Usulan',
  evaluasi: 'Evaluasi PD dan Unggah Rekomendasi',
  verifikasi: 'Verifikasi TAPD',
  perbaikan: 'Perbaikan',
  penetapan: 'Penetapan Berita Acara',
};

export const LABEL_ASPEK = {
  tusi: 'Kesesuaian dengan tugas dan fungsi PD',
  program: 'Kesesuaian program, kegiatan, dan subkegiatan',
  duplikasi: 'Tidak terjadi duplikasi anggaran',
  keuangan: 'Kemampuan keuangan daerah',
} as const;
export type KodeAspek = keyof typeof LABEL_ASPEK;
export const KODE_ASPEK = Object.keys(LABEL_ASPEK) as KodeAspek[];

/* ---------- Nilai (BR-01, BR-02) ---------- */

export interface RincianMasuk { volume: number; hargaSatuan: number; nilaiRekomendasi?: number | null }

/** Volume dibulatkan 2 angka desimal; jumlah dibulatkan ke rupiah. Nilai dari klien tidak pernah dipakai. */
export function hitungJumlah(r: { volume: number; hargaSatuan: number }): number {
  const vol = Math.round(r.volume * 100) / 100;
  return Math.round(vol * r.hargaSatuan);
}

export function hitungNilai(rincian: RincianMasuk[]) {
  const baris = rincian.map((r) => ({ jumlah: hitungJumlah(r), nilaiRekomendasi: r.nilaiRekomendasi ?? null }));
  const nilaiUsulan = baris.reduce((a, b) => a + b.jumlah, 0);
  const nilaiRekomendasi = baris.reduce((a, b) => a + (b.nilaiRekomendasi ?? 0), 0);
  return { baris, nilaiUsulan, nilaiRekomendasi };
}

/** BR-02: 0 ≤ nilai rekomendasi ≤ jumlah rincian. Mengembalikan galat per baris (indeks → pesan). */
export function cekNilaiRekomendasi(rincian: { jumlah: number; nilaiRekomendasi: number | null }[]): Record<string, string> {
  const g: Record<string, string> = {};
  rincian.forEach((r, i) => {
    if (r.nilaiRekomendasi === null) return;
    if (r.nilaiRekomendasi < 0) g[`rincian.${i}`] = 'Nilai rekomendasi tidak boleh negatif';
    else if (r.nilaiRekomendasi > r.jumlah) g[`rincian.${i}`] = 'Nilai rekomendasi tidak boleh melebihi nilai usulan rincian';
  });
  return g;
}

/* ---------- Verifikasi TAPD (BR-10) ---------- */

export interface MasukVerifikasi {
  aspek: { kode: KodeAspek; memenuhi: boolean | null; catatan: string }[];
  keputusan: 'disetujui' | 'ditolak' | 'perbaikan';
  nilaiDisetujui: number | null;
  alasan: string;
}

/** Mengembalikan nilai disetujui yang berlaku; melempar galat VALIDASI bila aturan dilanggar. */
export function validasiVerifikasi(v: MasukVerifikasi, nilaiRekomendasi: number): number | null {
  const g: Record<string, string> = {};
  const kode = new Set(v.aspek.map((a) => a.kode));
  if (KODE_ASPEK.some((k) => !kode.has(k))) g.aspek = 'Keempat aspek wajib diisi';
  if (v.keputusan !== 'perbaikan' && v.aspek.some((a) => a.memenuhi === null)) g.aspek = 'Setiap aspek wajib dinilai Memenuhi atau Tidak Memenuhi';
  let nilai: number | null;
  if (v.keputusan === 'ditolak') nilai = 0;
  else if (v.keputusan === 'perbaikan') nilai = null;
  else {
    if (v.nilaiDisetujui === null || v.nilaiDisetujui < 0) g.nilaiDisetujui = 'Nilai disetujui wajib diisi (minimal Rp0)';
    nilai = v.nilaiDisetujui;
  }
  const alasanWajib = v.keputusan === 'ditolak' || v.keputusan === 'perbaikan' || (v.keputusan === 'disetujui' && nilai !== nilaiRekomendasi);
  if (alasanWajib && !v.alasan.trim())
    g.alasan =
      v.keputusan === 'disetujui' ? 'Alasan wajib diisi karena nilai disetujui berbeda dari nilai rekomendasi' : 'Alasan wajib diisi untuk keputusan ini';
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
  return nilai;
}

/* ---------- Mesin status ---------- */

export type AksiStatus =
  | 'kirim' | 'kesimpulan_layak' | 'kesimpulan_tidak_layak' | 'ubah_kesimpulan' | 'masuk_rekomendasi' | 'keluar_rekomendasi'
  | 'unggah_rekomendasi' | 'putuskan_disetujui' | 'putuskan_ditolak' | 'putuskan_perbaikan' | 'kirim_ulang' | 'evaluasi_ulang';

const TRANSISI: Record<AksiStatus, { dari: StatusUsulan[]; ke: StatusUsulan }> = {
  kirim: { dari: ['draf'], ke: 'evaluasi' },
  kesimpulan_layak: { dari: ['evaluasi'], ke: 'layak' },
  kesimpulan_tidak_layak: { dari: ['evaluasi'], ke: 'tidak_layak' },
  ubah_kesimpulan: { dari: ['layak', 'tidak_layak'], ke: 'evaluasi' },
  masuk_rekomendasi: { dari: ['layak'], ke: 'dalam_rekomendasi' },
  keluar_rekomendasi: { dari: ['dalam_rekomendasi'], ke: 'layak' },
  unggah_rekomendasi: { dari: ['dalam_rekomendasi'], ke: 'rekomendasi_diunggah' },
  putuskan_disetujui: { dari: ['rekomendasi_diunggah', 'disetujui', 'ditolak', 'perbaikan'], ke: 'disetujui' },
  putuskan_ditolak: { dari: ['rekomendasi_diunggah', 'disetujui', 'ditolak', 'perbaikan'], ke: 'ditolak' },
  putuskan_perbaikan: { dari: ['rekomendasi_diunggah', 'disetujui', 'ditolak', 'perbaikan'], ke: 'perbaikan' },
  kirim_ulang: { dari: ['perbaikan'], ke: 'rekomendasi_diunggah' },
  evaluasi_ulang: { dari: ['perbaikan'], ke: 'evaluasi' },
};

/** Status tujuan sebuah aksi; melempar galat bila perpindahan dari status sekarang tidak sah. */
export function transisi(status: StatusUsulan, aksi: AksiStatus): StatusUsulan {
  const t = TRANSISI[aksi];
  if (!t.dari.includes(status))
    throw new Galat('VALIDASI', `Aksi tidak bisa dilakukan pada usulan berstatus ${LABEL_STATUS_USULAN[status]}`, { status });
  return t.ke;
}

/** BR-09: status yang masih boleh diubah isinya oleh Operator PD. */
export const STATUS_BISA_DIUBAH_PD: StatusUsulan[] = ['draf', 'evaluasi', 'layak', 'tidak_layak', 'perbaikan'];
export const bisaDiubahPd = (s: StatusUsulan) => STATUS_BISA_DIUBAH_PD.includes(s);

/** Tahapan jadwal yang berlaku untuk aksi PD pada usulan, tergantung status usulan. */
export function tahapanAksiPd(status: StatusUsulan): TahapanHibah {
  if (status === 'draf') return 'input';
  if (status === 'perbaikan') return 'perbaikan';
  return 'evaluasi';
}

/* ---------- Jadwal (BR-11) ---------- */

const ZONA_WIB = 7 * 60 * 60 * 1000;
/** Tanggal (YYYY-MM-DD) menurut WIB. */
export const hariWib = (d: Date) => new Date(d.getTime() + ZONA_WIB).toISOString().slice(0, 10);

export interface JadwalTahapan {
  tahapan: TahapanHibah;
  mulai: Date;
  selesai: Date;
  perpanjangan?: { skpdId: unknown; selesaiBaru: Date }[];
}

/** Berlaku dari tanggal mulai sampai akhir hari tanggal selesai (WIB), atau sampai perpanjangan PD itu. */
export function dalamJadwal(j: JadwalTahapan | null | undefined, skpdId: string | null | undefined, sekarang = new Date()): boolean {
  if (!j) return false;
  const hari = hariWib(sekarang);
  if (hari < hariWib(j.mulai)) return false;
  let akhir = hariWib(j.selesai);
  const p = skpdId ? j.perpanjangan?.find((x) => String(x.skpdId) === String(skpdId)) : undefined;
  if (p && hariWib(p.selesaiBaru) > akhir) akhir = hariWib(p.selesaiBaru);
  return hari <= akhir;
}

export function pastikanDalamJadwal(j: JadwalTahapan | null | undefined, tahapan: TahapanHibah, skpdId?: string | null, sekarang = new Date()) {
  if (dalamJadwal(j, skpdId, sekarang)) return;
  const rentang = j ? `${hariWib(j.mulai)} s.d. ${hariWib(j.selesai)}` : 'belum dijadwalkan';
  throw new Galat('DI_LUAR_JADWAL', `Di luar jadwal tahapan ${LABEL_TAHAPAN_HIBAH[tahapan]} (${rentang})`, { tahapan, rentang });
}

/* ---------- Nama dan pencocokan (FR-11) ---------- */

const GELAR = /\b(h|hj|dr|drs|dra|ir|st|s\.?t|s\.?pd|s\.?ag|s\.?e|s\.?h|s\.?kom|s\.?sos|m\.?pd|m\.?si|m\.?m|amd|a\.?md|kh|ust|ustadz|hajah|haji)\b\.?/g;
const AWALAN = /^(yayasan|pt|cv|kelompok|perkumpulan|koperasi|kop|ud|pokmas|poktan|gapoktan|lembaga|ormas|paguyuban|bumdes|bumdesa)\s+/;

/** Huruf kecil, tanpa tanda baca, gelar, dan awalan badan; spasi dirapatkan. */
export function normalisasiNama(s: string): string {
  let t = s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').replace(GELAR, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3 && AWALAN.test(t); i++) t = t.replace(AWALAN, '').trim();
  return t;
}

/** Kemiripan Jaro-Winkler 0..1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const jarak = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ca = new Array<boolean>(a.length).fill(false);
  const cb = new Array<boolean>(b.length).fill(false);
  let cocok = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - jarak); j < Math.min(b.length, i + jarak + 1); j++) {
      if (cb[j] || a[i] !== b[j]) continue;
      ca[i] = cb[j] = true;
      cocok++;
      break;
    }
  }
  if (!cocok) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!ca[i]) continue;
    while (!cb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (cocok / a.length + cocok / b.length + (cocok - t / 2) / cocok) / 3;
  let awal = 0;
  while (awal < 4 && a[awal] === b[awal]) awal++;
  return jaro + awal * 0.1 * (1 - jaro);
}

export const AMBANG_MIRIP = 0.92;
export const namaMirip = (a: string, b: string) => jaroWinkler(normalisasiNama(a), normalisasiNama(b)) >= AMBANG_MIRIP;

/* ---------- Identitas ---------- */

export function validasiIdentitas(jenis: 'nik' | 'nik_kk' | 'badan_hukum' | 'lainnya', identitas: string | null | undefined, nomorKk?: string | null) {
  const g: Record<string, string> = {};
  const nik = (identitas ?? '').replace(/\s/g, '');
  if (jenis === 'nik' || jenis === 'nik_kk') {
    if (!/^\d{16}$/.test(nik)) g.identitas = jenis === 'nik_kk' ? 'NIK kepala keluarga wajib 16 digit angka' : 'NIK wajib 16 digit angka';
    if (jenis === 'nik_kk' && !/^\d{16}$/.test((nomorKk ?? '').replace(/\s/g, ''))) g.nomorKk = 'Nomor KK wajib 16 digit angka';
  }
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
}

/** Nomor usulan HB-2027-0001. */
export const formatNomorUsulan = (tahun: number, urut: number) => `HB-${tahun}-${String(urut).padStart(4, '0')}`;

/** Terbilang bahasa Indonesia untuk rupiah bulat. */
export function terbilang(n: number): string {
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const t = (x: number): string => {
    if (x < 12) return satuan[x];
    if (x < 20) return `${t(x - 10)} belas`;
    if (x < 100) return `${t(Math.floor(x / 10))} puluh ${t(x % 10)}`;
    if (x < 200) return `seratus ${t(x - 100)}`;
    if (x < 1000) return `${t(Math.floor(x / 100))} ratus ${t(x % 100)}`;
    if (x < 2000) return `seribu ${t(x - 1000)}`;
    if (x < 1e6) return `${t(Math.floor(x / 1000))} ribu ${t(x % 1000)}`;
    if (x < 1e9) return `${t(Math.floor(x / 1e6))} juta ${t(x % 1e6)}`;
    if (x < 1e12) return `${t(Math.floor(x / 1e9))} miliar ${t(x % 1e9)}`;
    return `${t(Math.floor(x / 1e12))} triliun ${t(x % 1e12)}`;
  };
  if (n === 0) return 'nol rupiah';
  return `${t(Math.floor(n)).replace(/\s+/g, ' ').trim()} rupiah`;
}
