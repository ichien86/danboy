import { boleh, LABEL_PERAN, LABEL_PERAN_HIBAH, modulDiizinkan, peranHibah, type Modul, type PeranHibah, type SessionUser } from '@danboy/core';

/** Nama ikon dipetakan ke komponen lucide di kerangka (komponen klien); data menu tetap bisa dikirim dari server. */
export type NamaIkon =
  | 'dasbor' | 'rekap' | 'subkegiatan' | 'matriks' | 'perbedaan' | 'notifikasi' | 'verifikasi'
  | 'sumber-dana' | 'rekening' | 'nomenklatur' | 'skpd' | 'tahapan' | 'pengguna' | 'audit'
  | 'timeline' | 'penerima' | 'usulan' | 'rekomendasi' | 'kunci' | 'berita-acara' | 'progres'
  | 'master' | 'wilayah' | 'templat' | 'riwayat' | 'drive';

export interface ButirMenu { href: string; label: string; ikon: NamaIkon }
export interface GrupMenu { judul?: string; butir: ButirMenu[] }

export interface InfoModul { kode: Modul; nama: string; sub: string; href: string }
export const MODUL: Record<Modul, InfoModul> = {
  danboy: { kode: 'danboy', nama: 'Pendanaan', sub: 'Pemantauan sumber dana APBD', href: '/dasbor' },
  hibah: { kode: 'hibah', nama: 'Hibah dan Bansos', sub: 'Usulan dan verifikasi TAPD', href: '/hibah-bansos' },
};

type ButirBersyarat = ButirMenu & { tampil: boolean };
const saring = (grup: { judul?: string; butir: ButirBersyarat[] }[]): GrupMenu[] =>
  grup
    .map((g) => ({ judul: g.judul, butir: g.butir.filter((b) => b.tampil).map((b): ButirMenu => ({ href: b.href, label: b.label, ikon: b.ikon })) }))
    .filter((g) => g.butir.length > 0);

export function menuDanboy(user: SessionUser): GrupMenu[] {
  const bukanSkpd = user.peran !== 'skpd';
  return saring([
    {
      butir: [
        { href: '/dasbor', label: 'Dasbor', ikon: 'dasbor', tampil: true },
        { href: '/rekap-sumber-dana', label: 'Rekap Sumber Dana', ikon: 'rekap', tampil: bukanSkpd },
        { href: '/subkegiatan', label: 'Subkegiatan', ikon: 'subkegiatan', tampil: true },
        { href: '/matriks', label: 'Matriks', ikon: 'matriks', tampil: true },
        { href: '/perbedaan', label: 'Perbedaan SIPD', ikon: 'perbedaan', tampil: boleh(user, 'lihat_perbedaan') },
        { href: '/notifikasi', label: 'Notifikasi', ikon: 'notifikasi', tampil: true },
        { href: '/verifikasi', label: 'Verifikasi SIPD', ikon: 'verifikasi', tampil: true },
      ],
    },
    {
      judul: 'Master',
      butir: [
        { href: '/master/sumber-dana', label: 'Sumber Dana', ikon: 'sumber-dana', tampil: bukanSkpd },
        { href: '/master/rekening', label: 'Rekening', ikon: 'rekening', tampil: bukanSkpd },
        { href: '/master/nomenklatur', label: 'Nomenklatur', ikon: 'nomenklatur', tampil: bukanSkpd },
        { href: '/master/skpd', label: 'Perangkat Daerah', ikon: 'skpd', tampil: bukanSkpd },
      ],
    },
    {
      judul: 'Pengaturan',
      butir: [
        { href: '/pengaturan/tahapan', label: 'Tahun & Tahapan', ikon: 'tahapan', tampil: boleh(user, 'kelola_tahapan') },
        { href: '/pengaturan/pengguna', label: 'Pengguna', ikon: 'pengguna', tampil: boleh(user, 'kelola_pengguna') },
        { href: '/audit', label: 'Log Audit', ikon: 'audit', tampil: boleh(user, 'lihat_audit') },
      ],
    },
  ]);
}

/** Awalan semua halaman modul Hibah dan Bansos. */
export const AKAR_HIBAH = '/hibah-bansos';

const AP: PeranHibah = 'admin_perencana', OP: PeranHibah = 'operator_pd', V: PeranHibah = 'verifikator', A: PeranHibah = 'anggota';

/** Menu modul Hibah dan Bansos (Rencana Pengembangan, bagian Struktur Menu); `peran` = siapa yang melihat butir itu. */
export const MENU_HIBAH: { judul?: string; butir: (ButirMenu & { peran: PeranHibah[]; fase: number })[] }[] = [
  {
    butir: [
      { href: AKAR_HIBAH, label: 'Dashboard', ikon: 'dasbor', peran: [AP, OP, V, A], fase: 1 },
      { href: `${AKAR_HIBAH}/timeline`, label: 'Timeline', ikon: 'timeline', peran: [AP, OP, V, A], fase: 6 },
    ],
  },
  {
    judul: 'Usulan PD',
    butir: [
      { href: `${AKAR_HIBAH}/penerima`, label: 'Calon Penerima', ikon: 'penerima', peran: [AP, OP, V], fase: 3 },
      { href: `${AKAR_HIBAH}/usulan`, label: 'Usulan', ikon: 'usulan', peran: [AP, OP, V], fase: 3 },
      { href: `${AKAR_HIBAH}/rekomendasi`, label: 'Dokumen Rekomendasi', ikon: 'rekomendasi', peran: [AP, OP, V], fase: 4 },
    ],
  },
  {
    judul: 'TAPD',
    butir: [
      { href: `${AKAR_HIBAH}/verifikasi`, label: 'Verifikasi', ikon: 'verifikasi', peran: [V], fase: 5 },
      { href: `${AKAR_HIBAH}/kunci`, label: 'Kunci Hasil', ikon: 'kunci', peran: [AP, V], fase: 5 },
      { href: `${AKAR_HIBAH}/berita-acara`, label: 'Berita Acara', ikon: 'berita-acara', peran: [AP, V, A], fase: 6 },
    ],
  },
  {
    judul: 'Laporan',
    butir: [
      { href: `${AKAR_HIBAH}/progres`, label: 'Progres PD', ikon: 'progres', peran: [AP, OP, V, A], fase: 6 },
      { href: `${AKAR_HIBAH}/rekap`, label: 'Rekap', ikon: 'rekap', peran: [AP, OP, V, A], fase: 6 },
    ],
  },
  {
    judul: 'Pengaturan',
    butir: [
      { href: `${AKAR_HIBAH}/jadwal`, label: 'Tahun dan Jadwal', ikon: 'tahapan', peran: [AP], fase: 2 },
      { href: `${AKAR_HIBAH}/master`, label: 'Master', ikon: 'master', peran: [AP], fase: 2 },
      { href: `${AKAR_HIBAH}/wilayah`, label: 'Wilayah', ikon: 'wilayah', peran: [AP], fase: 2 },
      { href: `${AKAR_HIBAH}/templat`, label: 'Templat Dokumen', ikon: 'templat', peran: [AP, OP], fase: 4 },
      { href: `${AKAR_HIBAH}/riwayat`, label: 'Riwayat Penerima', ikon: 'riwayat', peran: [AP], fase: 2 },
      { href: `${AKAR_HIBAH}/drive`, label: 'Google Drive', ikon: 'drive', peran: [AP], fase: 2 },
      { href: `${AKAR_HIBAH}/audit`, label: 'Audit', ikon: 'audit', peran: [AP, V], fase: 2 },
    ],
  },
];

export function menuHibah(user: SessionUser): GrupMenu[] {
  const p = peranHibah(user);
  return saring(MENU_HIBAH.map((g) => ({ judul: g.judul, butir: g.butir.map((b) => ({ ...b, tampil: !!p && b.peran.includes(p) })) })));
}

/** Butir menu modul untuk sebuah alamat (dipakai halaman "segera hadir" dan pengecekan akses halaman). */
export function butirHibah(path: string) {
  for (const g of MENU_HIBAH) for (const b of g.butir) if (b.href === path) return b;
  return null;
}

/** Data kerangka untuk satu modul: menu, label peran, dan daftar modul yang boleh dipilih. */
export function kerangkaModul(user: SessionUser, aktif: Modul) {
  const p = peranHibah(user);
  return {
    modul: aktif,
    daftarModul: modulDiizinkan(user).map((m) => MODUL[m]),
    menu: aktif === 'hibah' ? menuHibah(user) : menuDanboy(user),
    pengguna: {
      nama: user.nama,
      peran: aktif === 'hibah' ? (p ? LABEL_PERAN_HIBAH[p] : '') : user.peran ? LABEL_PERAN[user.peran] : '',
    },
  };
}
