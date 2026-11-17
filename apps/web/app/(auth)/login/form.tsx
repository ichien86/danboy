'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { masuk } from './aksi';

export function FormMasuk({ lanjut }: { lanjut: string }) {
  const [state, aksi, memuat] = useActionState(masuk, { galat: '' });
  const [lihat, setLihat] = useState(false);
  return (
    <form action={aksi} className="space-y-4">
      <input type="hidden" name="lanjut" value={lanjut} />
      {state.galat && <Peringatan nada="bahaya">{state.galat}</Peringatan>}
      <Bidang label="Username" htmlFor="username">
        <Masukan id="username" name="username" autoComplete="username" required autoFocus />
      </Bidang>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium">
            Kata sandi
          </label>
          <button type="button" onClick={() => setLihat((x) => !x)} className="flex items-center gap-1 text-xs text-redup hover:text-teks" aria-pressed={lihat}>
            {lihat ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {lihat ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        <Masukan id="password" name="password" type={lihat ? 'text' : 'password'} autoComplete="current-password" required />
      </div>
      <Tombol type="submit" varian="utama" memuat={memuat} className="w-full">
        Masuk
      </Tombol>
    </form>
  );
}
