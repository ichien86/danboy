'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

/**
 * Masuk tanpa redirect di dalam server action: action hanya memasang cookie sesi lalu mengembalikan tujuan,
 * dan browser pindah halaman sendiri (muat penuh). Redirect di dalam action rapuh di hosting serverless
 * (mis. Netlify) dan bisa berujung "An unexpected response was received from the server".
 */
export async function masuk(_: { galat: string; ke?: string }, fd: FormData): Promise<{ galat: string; ke?: string }> {
  const lanjut = String(fd.get('lanjut') ?? '/dasbor');
  const ke = lanjut.startsWith('/') && !lanjut.startsWith('//') ? lanjut : '/dasbor';
  try {
    await signIn('credentials', {
      username: String(fd.get('username') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirect: false,
    });
    return { galat: '', ke };
  } catch (e) {
    if (e instanceof AuthError) {
      const kode = (e as AuthError & { code?: string }).code ?? '';
      if (kode.startsWith('terkunci')) {
        const menit = kode.split(':')[1];
        return { galat: `Akun dikunci karena terlalu banyak percobaan gagal. Coba lagi dalam ${menit || 15} menit.` };
      }
      if (kode === 'nonaktif') return { galat: 'Akun dinonaktifkan. Hubungi Super Admin.' };
      return { galat: 'Username atau kata sandi salah.' };
    }
    throw e;
  }
}
