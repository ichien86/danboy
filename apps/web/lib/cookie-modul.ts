/** Cookie modul terakhir dibuka; dibaca halaman "/" untuk membuka dashboard modul yang sama setelah login. Aman untuk edge. */
export const COOKIE_MODUL = 'danboy_modul';

const AWALAN_DANBOY = ['/dasbor', '/subkegiatan', '/matriks', '/perbedaan', '/rekap-sumber-dana', '/notifikasi', '/verifikasi', '/master', '/pengaturan', '/audit', '/impor'];

/** Modul yang memiliki sebuah halaman; null untuk halaman umum (login, ganti sandi, "/"). */
export function modulDariAlamat(path: string): 'danboy' | 'hibah' | null {
  if (path === '/hibah-bansos' || path.startsWith('/hibah-bansos/')) return 'hibah';
  if (AWALAN_DANBOY.some((a) => path === a || path.startsWith(a + '/'))) return 'danboy';
  return null;
}
