import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { boleh } from '@danboy/core';
import { detailSumberDana } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';
import { FormTagging, HapusTagging } from '../../tagging';

export const metadata: Metadata = { title: 'Sumber Dana' };

interface Tag {
  _id: string;
  kodeSubkegiatan: string;
  namaSubkegiatan?: string;
  kategori: string;
  rincian: string;
  kinerja?: string;
  indikator?: string;
  satuan?: string;
}

export default async function DetailSumberDana({ params, searchParams }: { params: Promise<{ kode: string }>; searchParams: SP }) {
  const { kode } = await params;
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  const tahun = num(sp.tahun, tahapan?.tahun ?? new Date().getFullYear());
  const sd = await detailSumberDana(user, decodeURIComponent(kode), tahun).catch(() => null);
  if (!sd) notFound();
  const kelola = boleh(user, 'kelola_master');
  const tagging = sd.tagging as unknown as Tag[];

  return (
    <>
      <KepalaHalaman
        judul={sd.nama}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{sd.kode}</span>
            {sd.khusus && <Lencana nada="info">khusus</Lencana>}
            {sd.namaTagging && <span>nama tagging: {sd.namaTagging}</span>}
            <Link href="/master/sumber-dana" className="text-utama hover:underline">
              ← Master sumber dana
            </Link>
          </span>
        }
      />
      <Kartu
        padat
        judul={`Daftar subkegiatan tertagging ${tahun} (${tagging.length})`}
        aksi={
          <div className="flex items-center gap-2">
            <form method="get" className="flex items-center gap-1.5 text-sm">
              <label htmlFor="tahun" className="text-redup">
                Tahun
              </label>
              <input id="tahun" name="tahun" type="number" defaultValue={tahun} className="h-8 w-20 rounded-md border border-garis bg-permukaan px-2" />
            </form>
            {kelola && <FormTagging tahun={tahun} sumberDanaId={String(sd._id)} />}
          </div>
        }
      >
        {tagging.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Subkegiatan</TH>
                <TH>Bidang › Program</TH>
                <TH>Rincian/Subbidang</TH>
                {kelola && <TH />}
              </tr>
            </thead>
            <tbody>
              {tagging.map((t) => (
                <tr key={t._id}>
                  <TD>
                    <Link href={`/master/nomenklatur/${encodeURIComponent(t.kodeSubkegiatan)}`} className="hover:underline">
                      <span className="font-mono text-xs text-redup">{t.kodeSubkegiatan}</span>
                      <span className="block">{t.namaSubkegiatan ?? '(tidak ada di nomenklatur aktif)'}</span>
                    </Link>
                  </TD>
                  <TD className="text-redup">{t.kategori}</TD>
                  <TD>{t.rincian}</TD>
                  {kelola && (
                    <TD>
                      <div className="flex gap-1">
                        <FormTagging tahun={tahun} sumberDanaId={String(sd._id)} awal={t} />
                        <HapusTagging id={t._id} />
                      </div>
                    </TD>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada tagging">Impor daftar tagging atau tambah manual.</Kosong>
        )}
      </Kartu>
    </>
  );
}
