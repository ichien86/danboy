import { Galat } from '../galat';
import type { SessionUser } from './index';

/** Peran di modul Hibah dan Bansos (TDD bagian Peran, Aksi, dan Pemilih Modul). */
export type PeranHibah = 'admin_perencana' | 'operator_pd' | 'verifikator' | 'anggota';

/** Nilai yang disimpan di akun; Operator PD tidak disimpan karena diturunkan dari akun SKPD. */
export type AksesHibah = Exclude<PeranHibah, 'operator_pd'>;
export const AKSES_HIBAH = ['admin_perencana', 'verifikator', 'anggota'] as const satisfies readonly AksesHibah[];

export type Modul = 'danboy' | 'hibah';

export const LABEL_PERAN_HIBAH: Record<PeranHibah, string> = {
  admin_perencana: 'Admin Perencana',
  operator_pd: 'Operator PD',
  verifikator: 'Verifikator TAPD',
  anggota: 'Anggota TAPD',
};

/** Akun SKPD otomatis menjadi Operator PD; akun lain memakai isian aksesHibah. */
export function peranHibah(user: Pick<SessionUser, 'peran' | 'aksesHibah'> | null | undefined): PeranHibah | null {
  if (!user) return null;
  if (user.peran === 'skpd') return 'operator_pd';
  return user.aksesHibah ?? null;
}

export function modulDiizinkan(user: Pick<SessionUser, 'peran' | 'aksesHibah'> | null | undefined): Modul[] {
  if (!user) return [];
  const m: Modul[] = [];
  if (user.peran) m.push('danboy');
  if (peranHibah(user)) m.push('hibah');
  return m;
}

export type AksiHibah =
  | 'hibah_lihat_rekap'
  | 'hibah_lihat_usulan'
  | 'hibah_kelola_tahun'
  | 'hibah_kelola_master'
  | 'hibah_kelola_drive'
  | 'hibah_kelola_templat_pd'
  | 'hibah_input_usulan'
  | 'hibah_evaluasi'
  | 'hibah_rekomendasi'
  | 'hibah_verifikasi'
  | 'hibah_kunci'
  | 'hibah_buka_kunci'
  | 'hibah_cetak_ba'
  | 'hibah_buka_ktp'
  | 'hibah_lihat_audit';

const AP = 'admin_perencana', OP = 'operator_pd', V = 'verifikator', A = 'anggota';

/** Matriks aksi modul. Operator PD selalu dibatasi ke PD-nya lewat cakupanHibah. */
const MATRIKS_HIBAH: Record<AksiHibah, readonly PeranHibah[]> = {
  hibah_lihat_rekap: [AP, OP, V, A],
  hibah_lihat_usulan: [AP, OP, V],
  hibah_kelola_tahun: [AP],
  hibah_kelola_master: [AP],
  hibah_kelola_drive: [AP],
  hibah_kelola_templat_pd: [AP, OP],
  hibah_input_usulan: [OP],
  hibah_evaluasi: [OP],
  hibah_rekomendasi: [OP],
  hibah_verifikasi: [V],
  hibah_kunci: [V],
  hibah_buka_kunci: [AP],
  hibah_cetak_ba: [AP, V],
  hibah_buka_ktp: [OP, V],
  hibah_lihat_audit: [AP, V],
};

export function bolehHibah(user: Pick<SessionUser, 'peran' | 'aksesHibah'> | null | undefined, aksi: AksiHibah): boolean {
  const p = peranHibah(user);
  return !!p && MATRIKS_HIBAH[aksi].includes(p);
}

export function pastikanBolehHibah(user: SessionUser | null | undefined, aksi: AksiHibah): asserts user is SessionUser {
  if (!user) throw new Galat('BELUM_LOGIN', 'Silakan masuk terlebih dahulu');
  if (!bolehHibah(user, aksi)) throw new Galat('TIDAK_BERHAK', 'Anda tidak berhak melakukan aksi ini');
}

/** Filter cakupan data modul; Operator PD hanya melihat data PD-nya sendiri. */
export function cakupanHibah(user: SessionUser): { skpdId?: string } {
  const p = peranHibah(user);
  if (!p) throw new Galat('TIDAK_BERHAK', 'Akun tidak punya akses modul Hibah dan Bansos');
  if (p === 'operator_pd') {
    if (!user.skpdId) throw new Galat('TIDAK_BERHAK', 'Akun SKPD belum terhubung ke SKPD');
    return { skpdId: user.skpdId };
  }
  return {};
}

/** Dokumen di luar cakupan diperlakukan sebagai tidak ada (404, bukan 403), agar data PD lain tidak bocor. */
export function dalamCakupanHibah(user: SessionUser, dok: { skpdId?: unknown } | null | undefined): boolean {
  if (!dok) return false;
  const c = cakupanHibah(user);
  return !c.skpdId || String(dok.skpdId) === c.skpdId;
}
