import type { Metadata } from 'next';
import Link from 'next/link';
import { daftarNomenklatur } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana, Masukan, Tombol } from '@/components/ui';
import { konteksHalaman, type SP } from '@/lib/halaman';
import { PohonNomenklatur } from './pohon';

export const metadata: Metadata = { title: 'Master Nomenklatur' };

export default async function MasterNomenklatur({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  const r = await daftarNomenklatur(user, { q: sp.q });
  const data = r.data as unknown as { _id: string; kode: string; nama: string; jenis: string; jumlahAnak: number }[];

  return (
    <>
      <KepalaHalaman judul="Master nomenklatur" sub={r.versi.length ? `Versi aktif: ${r.versi.join(', ')}` : 'Belum ada nomenklatur aktif'} />
      <form method="get" className="mb-3 flex gap-2">
        <Masukan name="q" defaultValue={sp.q} placeholder="Cari kode (awalan) atau nama" className="max-w-sm" aria-label="Cari nomenklatur" />
        <Tombol type="submit">Cari</Tombol>
      </form>
      <Kartu padat>
        {sp.q ? (
          data.length ? (
            <ul className="divide-y divide-garis">
              {data.map((n) => (
                <li key={n._id} className="px-4 py-2">
                  <Link href={`/master/nomenklatur/${encodeURIComponent(n.kode)}`} className="hover:underline">
                    <span className="font-mono text-xs text-redup">{n.kode}</span> {n.nama}
                  </Link>
                  <Lencana className="ml-2">{n.jenis}</Lencana>
                </li>
              ))}
            </ul>
          ) : (
            <Kosong judul="Tidak ditemukan" />
          )
        ) : data.length ? (
          <PohonNomenklatur akar={data} />
        ) : (
          <Kosong judul="Belum ada nomenklatur">Impor master nomenklatur dari menu Impor.</Kosong>
        )}
      </Kartu>
    </>
  );
}
