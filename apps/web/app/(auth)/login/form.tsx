'use client';

import { useActionState } from 'react';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { masuk } from './aksi';

export function FormMasuk({ lanjut }: { lanjut: string }) {
  const [state, aksi, memuat] = useActionState(masuk, { galat: '' });
  return (
    <form action={aksi} className="space-y-4">
      <input type="hidden" name="lanjut" value={lanjut} />
      {state.galat && <Peringatan nada="bahaya">{state.galat}</Peringatan>}
      <Bidang label="Username" htmlFor="username">
        <Masukan id="username" name="username" autoComplete="username" required autoFocus />
      </Bidang>
      <Bidang label="Kata sandi" htmlFor="password">
        <Masukan id="password" name="password" type="password" autoComplete="current-password" required />
      </Bidang>
      <Tombol type="submit" varian="utama" memuat={memuat} className="w-full">
        Masuk
      </Tombol>
    </form>
  );
}
