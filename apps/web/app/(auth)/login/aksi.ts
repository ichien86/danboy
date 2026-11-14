'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export async function masuk(_: { galat: string }, fd: FormData): Promise<{ galat: string }> {
  const lanjut = String(fd.get('lanjut') ?? '/dasbor');
  try {
    await signIn('credentials', {
      username: String(fd.get('username') ?? ''),
      password: String(fd.get('password') ?? ''),
      redirectTo: lanjut.startsWith('/') && !lanjut.startsWith('//') ? lanjut : '/dasbor',
    });
    return { galat: '' };
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
