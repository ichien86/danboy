import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { boleh } from '@danboy/core';
import { detailNomenklatur } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Tabel, TD, TH } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';
import { FormTagging, HapusTagging } from '../../tagging';
import { FormNomenklatur } from '../form';

export const metadata: Metadata = { title: 'Nomenklatur' };

export default async function DetailNomenklatur({ params, searchParams }: { params: Promise<{ kode: string }>; searchParams: SP }) {
  const { kode } = await params;
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  const tahun = num(sp.tahun, tahapan?.tahun ?? new Date().getFullYear());
  const d = await detailNomenklatur(user, decodeURIComponent(kode), tahun).catch(() => null);
  if (!d) notFound();
  const kelola = boleh(user, 'kelola_sumber_dana');
  const kelolaNomen = boleh(user, 'kelola_nomenklatur');
  const tagging = d.tagging as unknown as { _id: string; kodeSubkegiatan: string; kategori: string; rincian: string; sumberDanaId?: { nama: string; kode: string } }[];
  const leluhur = d.leluhur as unknown as { kode: string; nama: string }[];

  return (
    <>
      <KepalaHalaman
        judul={d.nama}
        aksi={kelolaNomen ? <FormNomenklatur awal={{ _id: String(d._id), kode: d.kode, nama: d.nama, jenis: d.jenis, aktif: d.aktif }} /> : undefined}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{d.kode}</span> · {d.jenis} · versi {d.versi}
            <Link href="/master/nomenklatur" className="text-utama hover:underline">
              ← Nomenklatur
            </Link>
          </span>
        }
      />
      {leluhur.length > 0 && (
        <ol className="mb-4 space-y-0.5 text-sm text-redup">
          {leluhur.map((l, i) => (
            <li key={l.kode} style={{ paddingLeft: `${i}rem` }}>
              <span className="font-mono text-xs">{l.kode}</span> {l.nama}
            </li>
          ))}
        </ol>
      )}
      {d.jenis === 'subkegiatan' && (
        <Kartu padat judul={`Tagging ${tahun} (${tagging.length})`} aksi={kelola ? <FormTagging tahun={tahun} kodeSubkegiatan={d.kode} /> : undefined}>
          {tagging.length ? (
            <Tabel>
              <thead>
                <tr>
                  <TH>Sumber dana</TH>
                  <TH>Bidang › Program</TH>
                  <TH>Rincian/Subbidang</TH>
                  {kelola && <TH />}
                </tr>
              </thead>
              <tbody>
                {tagging.map((t) => (
                  <tr key={t._id}>
                    <TD>
                      {t.sumberDanaId && (
                        <Link href={`/master/sumber-dana/${encodeURIComponent(t.sumberDanaId.kode)}`} className="hover:underline">
                          {t.sumberDanaId.nama}
                        </Link>
                      )}
                    </TD>
                    <TD className="text-redup">{t.kategori}</TD>
                    <TD>{t.rincian}</TD>
                    {kelola && (
                      <TD>
                        <div className="flex gap-1">
                          <FormTagging tahun={tahun} kodeSubkegiatan={d.kode} awal={t} />
                          <HapusTagging id={t._id} />
                        </div>
                      </TD>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabel>
          ) : (
            <Kosong judul="Tidak ada tagging" />
          )}
        </Kartu>
      )}
    </>
  );
}
