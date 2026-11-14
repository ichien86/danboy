import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { daftarSumberDana } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana, Masukan, Tabel, TD, TH, Tombol } from '@/components/ui';
import { konteksHalaman, type SP } from '@/lib/halaman';
import { FormSumberDana } from './form';

export const metadata: Metadata = { title: 'Master Sumber Dana' };

interface SD {
  _id: string;
  kode: string;
  nama: string;
  indukKode?: string;
  khusus: boolean;
  namaTagging?: string | null;
  aktif: boolean;
}

export default async function MasterSumberDana({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  const data = (await daftarSumberDana(user, { q: sp.q })) as unknown as SD[];
  const kelola = boleh(user, 'kelola_master');
  const kedalaman = (k: string) => k.split('.').length;
  const min = data.length ? Math.min(...data.map((d) => kedalaman(d.kode))) : 1;

  return (
    <>
      <KepalaHalaman judul="Master sumber dana" sub={`${data.length} sumber dana · tandai "khusus" untuk sumber dana yang wajib sesuai daftar tagging (R5)`} aksi={kelola ? <FormSumberDana /> : undefined} />
      <form method="get" className="mb-3 flex gap-2">
        <Masukan name="q" defaultValue={sp.q} placeholder="Cari kode atau nama" className="max-w-sm" aria-label="Cari sumber dana" />
        <Tombol type="submit">Cari</Tombol>
      </form>
      <Kartu padat>
        {data.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Kode</TH>
                <TH>Nama</TH>
                <TH>Nama tagging</TH>
                <TH>Status</TH>
                {kelola && <TH />}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d._id} className={d.aktif ? 'hover:bg-latar/60' : 'opacity-60'}>
                  <TD className="whitespace-nowrap font-mono text-xs">{d.kode}</TD>
                  <TD>
                    <Link href={`/master/sumber-dana/${encodeURIComponent(d.kode)}`} className="hover:underline" style={{ paddingLeft: sp.q ? 0 : `${(kedalaman(d.kode) - min) * 1}rem` }}>
                      {d.nama}
                    </Link>
                  </TD>
                  <TD className="text-redup">{d.namaTagging ?? '–'}</TD>
                  <TD>
                    <div className="flex gap-1">
                      {d.khusus && <Lencana nada="info">khusus</Lencana>}
                      {!d.aktif && <Lencana>nonaktif</Lencana>}
                    </div>
                  </TD>
                  {kelola && (
                    <TD>
                      <FormSumberDana awal={d} />
                    </TD>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada sumber dana">Impor master sumber dana dari menu Impor, atau tambah manual.</Kosong>
        )}
      </Kartu>
    </>
  );
}
