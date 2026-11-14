import { Galat } from '../galat';

export type Peran = 'super_admin' | 'admin' | 'skpd';

export interface SessionUser {
  id: string;
  username: string;
  nama: string;
  peran: Peran;
  skpdId?: string | null;
}

export type Aksi =
  | 'lihat'
  | 'ekspor'
  | 'impor'
  | 'ubah_alokasi'
  | 'isi_pagu'
  | 'kelola_master'
  | 'kelola_tahapan'
  | 'kelola_pengguna'
  | 'lihat_audit'
  | 'lihat_perbedaan'
  | 'tandai_verifikasi';

/** Matriks izin, Bagian 5 TDD. */
const MATRIKS: Record<Aksi, readonly Peran[]> = {
  lihat: ['super_admin', 'admin', 'skpd'],
  ekspor: ['super_admin', 'admin', 'skpd'],
  impor: ['super_admin', 'admin'],
  ubah_alokasi: ['super_admin', 'admin'],
  isi_pagu: ['super_admin', 'admin'],
  kelola_master: ['super_admin', 'admin'],
  kelola_tahapan: ['super_admin'],
  kelola_pengguna: ['super_admin'],
  lihat_audit: ['super_admin', 'admin'],
  lihat_perbedaan: ['super_admin', 'admin'],
  // centang pengingat "sudah disesuaikan di SIPD"; akun SKPD hanya untuk SKPD-nya sendiri
  tandai_verifikasi: ['super_admin', 'admin', 'skpd'],
};

export function boleh(user: Pick<SessionUser, 'peran'> | null | undefined, aksi: Aksi): boolean {
  return !!user && MATRIKS[aksi].includes(user.peran);
}

export function pastikanBoleh(user: SessionUser | null | undefined, aksi: Aksi): asserts user is SessionUser {
  if (!user) throw new Galat('BELUM_LOGIN', 'Silakan masuk terlebih dahulu');
  if (!boleh(user, aksi)) throw new Galat('TIDAK_BERHAK', 'Anda tidak berhak melakukan aksi ini');
}

/**
 * Filter cakupan data anggaran; wajib digabung ke setiap kueri data anggaran.
 * Akun SKPD otomatis mencakup semua sub unit di bawah SKPD-nya.
 */
export function cakupan(user: SessionUser): { skpdId?: string } {
  if (user.peran === 'skpd') {
    if (!user.skpdId) throw new Galat('TIDAK_BERHAK', 'Akun SKPD belum terhubung ke SKPD');
    return { skpdId: user.skpdId };
  }
  return {};
}

/** Untuk akses dokumen tunggal: dokumen di luar cakupan diperlakukan sebagai tidak ada (404, bukan 403). */
export function dalamCakupan(user: SessionUser, dok: { skpdId?: unknown } | null | undefined): boolean {
  if (!dok) return false;
  if (user.peran !== 'skpd') return true;
  return String(dok.skpdId) === String(user.skpdId);
}
