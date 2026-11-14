import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { batasUnggahMb, daftarRekening } from '@danboy/core/services';
import { TombolImpor } from '@/components/impor';
import { RiwayatImpor } from '@/components/riwayat-impor';
import { Kartu, KepalaHalaman, Kosong, Masukan, Paginasi, Tabel, TD, TH, Tombol } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';
import { FormRekening } from './form';

export const metadata: Metadata = { title: 'Master Rekening' };

export default async function MasterRekening({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  if (user.peran === 'skpd') redirect('/dasbor');
  const page = num(sp.page, 1);
  const r = await daftarRekening(user, { q: sp.q, page, limit: 50 });
  const kelola = boleh(user, 'kelola_sumber_dana');
  const data = r.data as unknown as { _id: string; kode: string; nama: string }[];

  return (
    <>
      <KepalaHalaman
        judul="Master rekening"
        sub={`${r.total.toLocaleString('id-ID')} rekening belanja`}
        aksi={
          kelola ? (
            <>
              <TombolImpor jenis="rekening" label="Impor rekening" batasMb={batasUnggahMb()} />
              <FormRekening />
            </>
          ) : undefined
        }
      />
      <form method="get" className="mb-3 flex gap-2">
        <Masukan name="q" data-cari defaultValue={sp.q} placeholder="Cari kode (awalan) atau nama  (tekan /)" className="max-w-sm" aria-label="Cari rekening" />
        <Tombol type="submit">Cari</Tombol>
      </form>
      <Kartu padat>
        {data.length ? (
          <>
            <Tabel>
              <thead>
                <tr>
                  <TH>Kode</TH>
                  <TH>Nama</TH>
                  {kelola && <TH />}
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d._id} className="hover:bg-latar/60">
                    <TD className="whitespace-nowrap font-mono text-xs">{d.kode}</TD>
                    <TD>{d.nama}</TD>
                    {kelola && (
                      <TD>
                        <FormRekening awal={d} />
                      </TD>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabel>
            <Paginasi total={r.total} page={page} limit={50} dasar="/master/rekening" param={{ q: sp.q }} />
          </>
        ) : (
          <Kosong judul={sp.q ? 'Tidak ditemukan' : 'Belum ada rekening'}>{!sp.q && kelola && 'Impor dari file lewat tombol di atas, atau tambah manual.'}</Kosong>
        )}
      </Kartu>
      {kelola && <RiwayatImpor user={user} jenis="rekening" />}
    </>
  );
}
