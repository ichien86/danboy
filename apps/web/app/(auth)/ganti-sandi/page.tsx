import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { FormGantiSandi } from './form';

export const metadata: Metadata = { title: 'Ganti kata sandi' };

export default async function HalamanGantiSandi() {
  const s = await auth();
  if (!s?.user) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-garis bg-permukaan p-6">
        <h1 className="text-base font-semibold">Ganti kata sandi</h1>
        <p className="mb-4 mt-1 text-sm text-redup">
          {s.user.wajibGantiSandi ? 'Demi keamanan, ganti kata sandi sementara sebelum melanjutkan.' : `Akun ${s.user.username}`}
        </p>
        <FormGantiSandi wajib={s.user.wajibGantiSandi} />
      </div>
    </main>
  );
}
