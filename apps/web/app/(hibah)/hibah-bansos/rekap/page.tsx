import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { rekapHibah, tahunAktifAtauNull } from '@danboy/core/services';
import { Rupiah } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Rekap' };

const DIMENSI = [
  { kode: 'pd', label: 'Per PD' },
  { kode: 'jenis', label: 'Per jenis penerima' },
  { kode: 'bentuk', label: 'Per bentuk' },
  { kode: 'status', label: 'Per status' },
] as const;

/** FR-47: rekap jumlah usulan, nilai usulan, rekomendasi, dan disetujui; ekspor Excel. */
export default async function HalamanRekap({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_lihat_rekap', searchParams);
  const t = await tahunAktifAtauNull();
  if (!t) return <Kartu><Kosong judul="Belum ada tahun anggaran aktif" /></Kartu>;
  const dimensi = DIMENSI.find((d) => d.kode === sp.dimensi)?.kode ?? 'pd';
  const r = (await rekapHibah(user, t.tahun, dimensi)) as Data;
  const tot = (r.baris as Data[]).reduce((a, b) => ({ j: a.j + b.jumlah, u: a.u + b.nilaiUsulan, r: a.r + b.nilaiRekomendasi, d: a.d + b.nilaiDisetujui }), { j: 0, u: 0, r: 0, d: 0 });
  return (
    <>
      <KepalaHalaman
        judul="Rekap"
        sub={`Rekap usulan hibah dan bansos TA ${r.tahun}.`}
        aksi={
          <a href={`/api/hibah/rekap/ekspor?tahun=${r.tahun}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-garis px-3 text-sm hover:bg-latar">
            <Download className="size-3.5" aria-hidden /> Ekspor Excel
          </a>
        }
      />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Dimensi rekap">
        {DIMENSI.map((d) => (
          <Link key={d.kode} href={`?dimensi=${d.kode}`} aria-current={d.kode === dimensi ? 'page' : undefined} className={`rounded-md px-3 py-1.5 text-sm ${d.kode === dimensi ? 'bg-utama-lembut font-medium text-utama' : 'text-redup hover:bg-latar'}`}>
            {d.label}
          </Link>
        ))}
      </nav>
      <Kartu padat>
        <Tabel>
          <thead>
            <tr>
              <TH>{DIMENSI.find((d) => d.kode === dimensi)!.label.replace('Per ', '')}</TH>
              <TH kanan>Usulan</TH>
              <TH kanan>Nilai usulan</TH>
              <TH kanan>Nilai rekomendasi</TH>
              <TH kanan>Nilai disetujui</TH>
            </tr>
          </thead>
          <tbody>
            {(r.baris as Data[]).map((b) => (
              <tr key={b.kunci}>
                <TD>{b.label}</TD>
                <TD kanan>{b.jumlah}</TD>
                <TD kanan>
                  <Rupiah nilai={b.nilaiUsulan} />
                </TD>
                <TD kanan>
                  <Rupiah nilai={b.nilaiRekomendasi} />
                </TD>
                <TD kanan>
                  <Rupiah nilai={b.nilaiDisetujui} />
                </TD>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <TD className="font-semibold">Jumlah</TD>
              <TD kanan className="font-semibold">
                {tot.j}
              </TD>
              <TD kanan className="font-semibold">
                <Rupiah nilai={tot.u} />
              </TD>
              <TD kanan className="font-semibold">
                <Rupiah nilai={tot.r} />
              </TD>
              <TD kanan className="font-semibold">
                <Rupiah nilai={tot.d} />
              </TD>
            </tr>
          </tfoot>
        </Tabel>
      </Kartu>
    </>
  );
}
