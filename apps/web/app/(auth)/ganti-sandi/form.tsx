'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { gantiSandi } from '@danboy/schema';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, GalatApi } from '@/lib/klien';
import { tandaiSandiDiganti } from './aksi';

export function FormGantiSandi({ wajib }: { wajib: boolean }) {
  const router = useRouter();
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data = { sandiLama: String(fd.get('sandiLama')), sandiBaru: String(fd.get('sandiBaru')), ulangiSandi: String(fd.get('ulangiSandi')) };
        const v = gantiSandi.safeParse(data);
        if (!v.success) {
          setGalat(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
          return;
        }
        setGalat({});
        setUmum('');
        setMemuat(true);
        try {
          await api('/api/akun/ganti-sandi', { body: data });
          await tandaiSandiDiganti();
          router.replace('/dasbor');
          router.refresh();
        } catch (err) {
          if (err instanceof GalatApi && err.detail) setGalat(err.detail);
          setUmum(err instanceof Error ? err.message : 'Gagal');
        } finally {
          setMemuat(false);
        }
      }}
    >
      {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
      <Bidang label={wajib ? 'Kata sandi sementara' : 'Kata sandi lama'} htmlFor="sandiLama" galat={galat.sandiLama}>
        <Masukan id="sandiLama" name="sandiLama" type="password" autoComplete="current-password" required />
      </Bidang>
      <Bidang label="Kata sandi baru" htmlFor="sandiBaru" galat={galat.sandiBaru} bantuan="Minimal 10 karakter, ada huruf besar, huruf kecil, dan angka.">
        <Masukan id="sandiBaru" name="sandiBaru" type="password" autoComplete="new-password" required />
      </Bidang>
      <Bidang label="Ulangi kata sandi baru" htmlFor="ulangiSandi" galat={galat.ulangiSandi}>
        <Masukan id="ulangiSandi" name="ulangiSandi" type="password" autoComplete="new-password" required />
      </Bidang>
      <Tombol type="submit" varian="utama" memuat={memuat} className="w-full">
        Simpan kata sandi
      </Tombol>
    </form>
  );
}
