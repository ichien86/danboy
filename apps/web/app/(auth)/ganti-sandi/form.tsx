'use client';

import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ATURAN_SANDI, gantiSandi } from '@danboy/schema';
import { Bidang, Masukan, Peringatan, Tombol, cx } from '@/components/ui';
import { api, GalatApi } from '@/lib/klien';
import { tandaiSandiDiganti } from './aksi';

/** Satu baris syarat: abu-abu dengan lingkaran kosong, berubah hijau bercentang begitu terpenuhi. */
function Syarat({ terpenuhi, children }: { terpenuhi: boolean; children: React.ReactNode }) {
  return (
    <li className={cx('flex items-center gap-2 transition-colors', terpenuhi ? 'font-medium text-aman' : 'text-redup')}>
      {terpenuhi ? <Check className="size-4 shrink-0" aria-hidden /> : <Circle className="size-4 shrink-0" aria-hidden />}
      <span>{children}</span>
      <span className="sr-only">{terpenuhi ? '(terpenuhi)' : '(belum terpenuhi)'}</span>
    </li>
  );
}

export function FormGantiSandi({ wajib }: { wajib: boolean }) {
  const router = useRouter();
  const [sandiLama, setSandiLama] = useState('');
  const [sandiBaru, setSandiBaru] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);

  const hasil = ATURAN_SANDI.map((a) => ({ ...a, ok: a.cek(sandiBaru) }));
  const beda = sandiBaru.length > 0 && sandiBaru !== sandiLama;
  const sama = ulangi.length > 0 && ulangi === sandiBaru;
  const semuaOk = hasil.every((h) => h.ok) && beda && sama;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = { sandiLama, sandiBaru, ulangiSandi: ulangi };
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
        <Masukan
          id="sandiLama"
          type={lihat ? 'text' : 'password'}
          autoComplete="current-password"
          value={sandiLama}
          onChange={(e) => setSandiLama(e.target.value)}
          required
        />
      </Bidang>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="sandiBaru" className="block text-sm font-medium">
            Kata sandi baru
          </label>
          <button
            type="button"
            onClick={() => setLihat((x) => !x)}
            className="flex items-center gap-1 text-xs text-redup hover:text-teks"
            aria-pressed={lihat}
          >
            {lihat ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {lihat ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>
        <Masukan
          id="sandiBaru"
          type={lihat ? 'text' : 'password'}
          autoComplete="new-password"
          value={sandiBaru}
          onChange={(e) => setSandiBaru(e.target.value)}
          aria-describedby="syarat-sandi"
          required
        />
        <ul id="syarat-sandi" className="space-y-1 rounded-md bg-latar px-3 py-2.5 text-sm" aria-live="polite">
          {hasil.map((h) => (
            <Syarat key={h.kode} terpenuhi={h.ok}>
              {h.label}
            </Syarat>
          ))}
          <Syarat terpenuhi={beda}>Berbeda dari sandi {wajib ? 'sementara' : 'lama'}</Syarat>
        </ul>
        {galat.sandiBaru && <p className="text-xs text-bahaya">{galat.sandiBaru}</p>}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ulangiSandi" className="block text-sm font-medium">
          Ulangi kata sandi baru
        </label>
        <Masukan
          id="ulangiSandi"
          type={lihat ? 'text' : 'password'}
          autoComplete="new-password"
          value={ulangi}
          onChange={(e) => setUlangi(e.target.value)}
          aria-describedby="syarat-ulangi"
          required
        />
        <ul id="syarat-ulangi" className="px-3 text-sm" aria-live="polite">
          <Syarat terpenuhi={sama}>Sama dengan kata sandi baru</Syarat>
        </ul>
        {galat.ulangiSandi && <p className="text-xs text-bahaya">{galat.ulangiSandi}</p>}
      </div>

      <Tombol type="submit" varian="utama" memuat={memuat} disabled={!semuaOk || !sandiLama} className="w-full">
        Simpan kata sandi
      </Tombol>
    </form>
  );
}
