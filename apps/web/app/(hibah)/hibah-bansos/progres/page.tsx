import type { Metadata } from 'next';
import { LABEL_STATUS_USULAN, type StatusUsulan } from '@danboy/core';
import { progresPd, tahunAktifAtauNull } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Progres PD' };

const URUT: StatusUsulan[] = ['draf', 'evaluasi', 'layak', 'tidak_layak', 'dalam_rekomendasi', 'rekomendasi_diunggah', 'perbaikan', 'disetujui', 'ditolak'];

/** FR-41: jumlah usulan per status per PD. */
export default async function HalamanProgres() {
  const { user } = await halamanHibah('hibah_lihat_rekap');
  const t = await tahunAktifAtauNull();
  if (!t) return <Kartu><Kosong judul="Belum ada tahun anggaran aktif" /></Kartu>;
  const p = (await progresPd(user, t.tahun)) as Data;
  const total = Object.fromEntries(URUT.map((s) => [s, (p.baris as Data[]).reduce((a, b) => a + (b.perStatus[s] ?? 0), 0)]));
  return (
    <>
      <KepalaHalaman judul="Progres PD" sub={`Jumlah usulan per status per Perangkat Daerah, TA ${p.tahun}. "Belum unggah" = usulan yang belum sampai ke TAPD.`} />
      <Kartu padat>
        {p.baris.length ? (
          <div className="overflow-x-auto">
            <Tabel>
              <thead>
                <tr>
                  <TH>Perangkat Daerah</TH>
                  {URUT.map((s) => (
                    <TH key={s} kanan className="whitespace-nowrap">
                      {LABEL_STATUS_USULAN[s]}
                    </TH>
                  ))}
                  <TH kanan>Total</TH>
                  <TH kanan>Belum unggah</TH>
                </tr>
              </thead>
              <tbody>
                {(p.baris as Data[]).map((b) => (
                  <tr key={b.skpdId}>
                    <TD>
                      {b.namaPd} {b.terkunci && <Lencana nada="info">terkunci</Lencana>}
                    </TD>
                    {URUT.map((s) => (
                      <TD key={s} kanan className={b.perStatus[s] ? '' : 'text-redup'}>
                        {b.perStatus[s] ?? 0}
                      </TD>
                    ))}
                    <TD kanan className="font-medium">
                      {b.total}
                    </TD>
                    <TD kanan className={b.belumUnggah ? 'font-medium text-waspada' : 'text-redup'}>
                      {b.belumUnggah}
                    </TD>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <TD className="font-semibold">Jumlah</TD>
                  {URUT.map((s) => (
                    <TD key={s} kanan className="font-semibold">
                      {total[s]}
                    </TD>
                  ))}
                  <TD kanan className="font-semibold">
                    {(p.baris as Data[]).reduce((a, b) => a + b.total, 0)}
                  </TD>
                  <TD kanan className="font-semibold">
                    {(p.baris as Data[]).reduce((a, b) => a + b.belumUnggah, 0)}
                  </TD>
                </tr>
              </tfoot>
            </Tabel>
          </div>
        ) : (
          <Kosong judul="Belum ada usulan" />
        )}
      </Kartu>
    </>
  );
}
