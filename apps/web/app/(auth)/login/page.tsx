import type { Metadata } from 'next';
import { FormMasuk } from './form';

export const metadata: Metadata = { title: 'Masuk' };

export default async function HalamanMasuk({ searchParams }: { searchParams: Promise<{ lanjut?: string }> }) {
  const { lanjut } = await searchParams;
  const aman = lanjut && lanjut.startsWith('/') && !lanjut.startsWith('//') ? lanjut : '/dasbor';
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-10" />
          <div>
            <h1 className="text-lg font-bold tracking-wide">DANBOY</h1>
            <p className="text-sm text-redup">Pemantauan sumber dana APBD</p>
          </div>
        </div>
        <div className="rounded-lg border border-garis bg-permukaan p-6">
          <h2 className="mb-4 text-base font-semibold">Masuk ke akun Anda</h2>
          <FormMasuk lanjut={aman} />
        </div>
        <p className="mt-4 text-center text-xs text-redup">Lupa kata sandi? Hubungi Super Admin untuk reset.</p>
      </div>
    </main>
  );
}
