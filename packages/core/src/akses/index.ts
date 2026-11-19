import { Galat } from '../galat';
import type { AksesHibah } from './hibah';

export * from './hibah';

export type Peran = 'super_admin' | 'admin' | 'skpd';

export interface SessionUser {
  id: string;
  username: string;
  nama: string;
  /** Peran di DANBOY; null = akun tanpa akses DANBOY (mis. Admin Perencana yang hanya memakai modul Hibah dan Bansos). */
  peran: Peran | null;
  skpdId?: string | null;
  /** Peran di modul Hibah dan Bansos untuk akun non-SKPD; akun SKPD otomatis Operator PD. */
  aksesHibah?: AksesHibah | null;
}

export type Aksi =
  | 'lihat'
  | 'ekspor'
  | 'impor'
  | 'ubah_alokasi'
  | 'isi_pagu'
  | 'kelola_skpd'
  | 'kelola_nomenklatur'
  | 'kelola_sumber_dana'
  | 'kelola_tahapan'
  | 'kelola_pengguna'
  | 'lihat_audit'
  | 'lihat_perbedaan'
  | 'tandai_verifikasi';

/** Matriks izin, Bagian 5 TDD. */
const MATRIKS: Record<Aksi, readonly Peran[]> = {
  lihat: ['super_admin', 'admin', 'skpd'],
  ekspor: ['super_admin', 'admin', 'skpd'],
  // impor rincian APBD, verifikasi SIPD, sumber dana, rekening, tagging (nomenklatur: kelola_nomenklatur)
  impor: ['super_admin', 'admin'],
  ubah_alokasi: ['super_admin', 'admin'],
  isi_pagu: ['super_admin', 'admin'],
  // perangkat daerah (SKPD, sub unit) dan nomenklatur: kewenangan Super Admin
  kelola_skpd: ['super_admin'],
  kelola_nomenklatur: ['super_admin'],
  // sumber dana, tagging, rekening: diampu Admin Keuangan
  kelola_sumber_dana: ['super_admin', 'admin'],
  kelola_tahapan: ['super_admin'],
  kelola_pengguna: ['super_admin'],
  lihat_audit: ['super_admin', 'admin'],
  lihat_perbedaan: ['super_admin', 'admin'],
  // centang pengingat "sudah disesuaikan di SIPD"; akun SKPD hanya untuk SKPD-nya sendiri
  tandai_verifikasi: ['super_admin', 'admin', 'skpd'],
};

export function boleh(user: Pick<SessionUser, 'peran'> | null | undefined, aksi: Aksi): boolean {
  return !!user?.peran && MATRIKS[aksi].includes(user.peran);
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
  // akun tanpa peran DANBOY tidak boleh mendapat cakupan "semua"
  if (!user.peran) throw new Galat('TIDAK_BERHAK', 'Akun tidak punya akses DANBOY');
  if (user.peran === 'skpd') {
    if (!user.skpdId) throw new Galat('TIDAK_BERHAK', 'Akun SKPD belum terhubung ke SKPD');
    return { skpdId: user.skpdId };
  }
  return {};
}

/** Untuk akses dokumen tunggal: dokumen di luar cakupan diperlakukan sebagai tidak ada (404, bukan 403). */
export function dalamCakupan(user: SessionUser, dok: { skpdId?: unknown } | null | undefined): boolean {
  if (!dok || !user.peran) return false;
  if (user.peran !== 'skpd') return true;
  return String(dok.skpdId) === String(user.skpdId);
}

/** Izin yang dibutuhkan untuk mengunggah/menerapkan impor menurut jenisnya. */
export function aksiImpor(jenis: string): Aksi {
  if (jenis === 'nomenklatur') return 'kelola_nomenklatur';
  if (jenis === 'skpd') return 'kelola_skpd';
  return 'impor';
}

export const LABEL_PERAN: Record<Peran, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin Keuangan',
  skpd: 'SKPD',
};
