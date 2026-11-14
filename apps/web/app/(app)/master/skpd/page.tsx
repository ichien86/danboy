import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { daftarSkpd } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana, Masukan, Tombol } from '@/components/ui';
import { konteksHalaman, type SP } from '@/lib/halaman';
import { FormUnit } from './form';

export const metadata: Metadata = { title: 'Master SKPD' };

interface Unit {
  _id: string;
  kode: string;
  nama: string;
  aktif: boolean;
}

export default async function MasterSkpd({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  if (!boleh(user, 'kelola_master')) redirect('/dasbor');
  const data = (await daftarSkpd(user, { q: sp.q })) as unknown as (Unit & { subUnit: Unit[] })[];
  return (
    <>
      <KepalaHalaman judul="Master SKPD dan sub unit" sub={`${data.length} SKPD · SKPD dan sub unit baru juga dibuat otomatis saat impor APBD`} aksi={<FormUnit />} />
      <form method="get" className="mb-3 flex gap-2">
        <Masukan name="q" defaultValue={sp.q} placeholder="Cari kode atau nama SKPD" className="max-w-sm" aria-label="Cari SKPD" />
        <Tombol type="submit">Cari</Tombol>
      </form>
      {data.length ? (
        <div className="space-y-3">
          {data.map((s) => (
            <Kartu
              key={s._id}
              padat
              judul={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-normal text-redup">{s.kode}</span>
                  {s.nama}
                  {!s.aktif && <Lencana>nonaktif</Lencana>}
                </span>
              }
              aksi={
                <div className="flex gap-1">
                  <FormUnit awal={s} />
                  <FormUnit skpdId={s._id} />
                </div>
              }
            >
              <ul className="divide-y divide-garis">
                {s.subUnit.map((u) => (
                  <li key={u._id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                    <span className="font-mono text-xs text-redup">{u.kode}</span>
                    <span className="flex-1">{u.nama}</span>
                    {!u.aktif && <Lencana>nonaktif</Lencana>}
                    <FormUnit awal={u} subUnit />
                  </li>
                ))}
                {!s.subUnit.length && <li className="px-4 py-2 text-sm text-redup">Belum ada sub unit</li>}
              </ul>
            </Kartu>
          ))}
        </div>
      ) : (
        <Kartu>
          <Kosong judul="Belum ada SKPD" />
        </Kartu>
      )}
    </>
  );
}
