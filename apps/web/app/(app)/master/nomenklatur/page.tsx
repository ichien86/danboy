import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { batasUnggahMb, daftarNomenklatur } from '@danboy/core/services';
import { TombolImpor } from '@/components/impor';
import { RiwayatImpor } from '@/components/riwayat-impor';
import { Kartu, KepalaHalaman, Kosong, Lencana, Masukan, Tombol } from '@/components/ui';
import { konteksHalaman, type SP } from '@/lib/halaman';
import { FormNomenklatur } from './form';
import { PohonNomenklatur } from './pohon';

export const metadata: Metadata = { title: 'Master Nomenklatur' };

export default async function MasterNomenklatur({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  const r = await daftarNomenklatur(user, { q: sp.q });
  const data = r.data as unknown as { _id: string; kode: string; nama: string; jenis: string; aktif: boolean; jumlahAnak: number }[];
  const kelola = boleh(user, 'kelola_nomenklatur');

  return (
    <>
      <KepalaHalaman
        judul="Master nomenklatur"
        sub={`${r.versi.length ? `Versi aktif: ${r.versi.join(', ')}` : 'Belum ada nomenklatur aktif'}${kelola ? '' : ' · dikelola oleh Super Admin'}`}
        aksi={
          kelola ? (
            <>
              <TombolImpor jenis="nomenklatur" label="Impor dari SIPD" batasMb={batasUnggahMb()} />
              <FormNomenklatur />
            </>
          ) : undefined
        }
      />
      <form method="get" className="mb-3 flex gap-2">
        <Masukan name="q" data-cari defaultValue={sp.q} placeholder="Cari kode (awalan) atau nama  (tekan /)" className="max-w-sm" aria-label="Cari nomenklatur" />
        <Tombol type="submit">Cari</Tombol>
      </form>
      <Kartu padat>
        {sp.q ? (
          data.length ? (
            <ul className="divide-y divide-garis">
              {data.map((n) => (
                <li key={n._id} className="flex items-center gap-2 px-4 py-2">
                  <Link href={`/master/nomenklatur/${encodeURIComponent(n.kode)}`} className="hover:underline">
                    <span className="font-mono text-xs text-redup">{n.kode}</span> {n.nama}
                  </Link>
                  <Lencana>{n.jenis}</Lencana>
                  {kelola && (
                    <span className="ml-auto">
                      <FormNomenklatur awal={n} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Kosong judul="Tidak ditemukan" />
          )
        ) : data.length ? (
          <PohonNomenklatur akar={data} bolehUbah={kelola} />
        ) : (
          <Kosong judul="Belum ada nomenklatur">{kelola ? 'Impor nomenklatur dari SIPD atau tambah manual lewat tombol di atas.' : 'Super Admin belum mengisi nomenklatur.'}</Kosong>
        )}
      </Kartu>
      {kelola && <RiwayatImpor user={user} jenis="nomenklatur" />}
    </>
  );
}
