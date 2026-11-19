import type { Metadata } from 'next';
import { progresPd, statusKunci, tahunAktifAtauNull } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { TombolAksi } from '@/components/hibah';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { BukaKunci } from './buka';

export const metadata: Metadata = { title: 'Kunci Hasil' };

/** FR-36: kunci per PD atau seluruh tahun; buka kunci hanya Admin Perencana dengan alasan. */
export default async function HalamanKunci() {
  const { user } = await halamanHibah(['hibah_kunci', 'hibah_buka_kunci']);
  const t = await tahunAktifAtauNull();
  if (!t) return <Kartu><Kosong judul="Belum ada tahun anggaran aktif" /></Kartu>;
  const [k, p] = (await Promise.all([statusKunci(user, t.tahun), progresPd(user, t.tahun)])) as [Data, Data];
  const terkunciPd = new Map((k.kunciPd as Data[]).map((x) => [String(x.skpdId), x]));
  return (
    <>
      <KepalaHalaman
        judul="Kunci Hasil"
        sub={`Hasil verifikasi yang terkunci tidak bisa diubah dan menjadi dasar Berita Acara TA ${t.tahun}.`}
        aksi={
          k.kunciTahun?.terkunci ? (
            k.bolehBuka && <BukaKunci tahun={t.tahun} label="Buka kunci tahun" />
          ) : (
            k.bolehKunci && <TombolAksi url="/api/hibah/kunci" body={{ tahun: t.tahun }} label={`Kunci seluruh TA ${t.tahun}`} varian="utama" kecil={false} konfirmasi={`Kunci hasil verifikasi seluruh PD TA ${t.tahun}?`} berhasil="Hasil dikunci" />
          )
        }
      />
      {k.kunciTahun?.terkunci && (
        <Kartu className="mb-4">
          <p className="text-sm">
            <Lencana nada="info">Seluruh tahun terkunci</Lencana> <span className="text-redup">sejak {tanggal(k.kunciTahun.waktu, true)}</span>
          </p>
        </Kartu>
      )}
      <Kartu judul="Per Perangkat Daerah" padat>
        <Tabel>
          <thead>
            <tr>
              <TH>Perangkat Daerah</TH>
              <TH kanan>Usulan</TH>
              <TH kanan>Disetujui</TH>
              <TH kanan>Ditolak</TH>
              <TH kanan>Belum diputus</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {(p.baris as Data[]).map((b) => {
              const belum = b.total - (b.perStatus.disetujui ?? 0) - (b.perStatus.ditolak ?? 0);
              const kunci = k.kunciTahun?.terkunci || terkunciPd.has(b.skpdId);
              return (
                <tr key={b.skpdId}>
                  <TD>{b.namaPd}</TD>
                  <TD kanan>{b.total}</TD>
                  <TD kanan>{b.perStatus.disetujui ?? 0}</TD>
                  <TD kanan>{b.perStatus.ditolak ?? 0}</TD>
                  <TD kanan className={belum ? 'text-waspada' : ''}>{belum}</TD>
                  <TD>{kunci ? <Lencana nada="info">Terkunci</Lencana> : <Lencana>Terbuka</Lencana>}</TD>
                  <TD>
                    {!kunci && k.bolehKunci && (
                      <TombolAksi url="/api/hibah/kunci" body={{ tahun: t.tahun, skpdId: b.skpdId }} label="Kunci" konfirmasi={belum ? `${belum} usulan belum diputus. Kunci tetap?` : `Kunci hasil ${b.namaPd}?`} berhasil="PD dikunci" />
                    )}
                    {kunci && !k.kunciTahun?.terkunci && k.bolehBuka && <BukaKunci tahun={t.tahun} skpdId={b.skpdId} label="Buka" />}
                  </TD>
                </tr>
              );
            })}
            {!p.baris.length && (
              <tr>
                <TD colSpan={7} className="py-6 text-center text-redup">
                  Belum ada usulan
                </TD>
              </tr>
            )}
          </tbody>
        </Tabel>
      </Kartu>
      {(k.riwayatBukaKunci as Data[]).length > 0 && (
        <Kartu judul="Riwayat buka kunci" className="mt-4" padat>
          <Tabel>
            <thead>
              <tr>
                <TH>Waktu</TH>
                <TH>Cakupan</TH>
                <TH>Alasan</TH>
              </tr>
            </thead>
            <tbody>
              {(k.riwayatBukaKunci as Data[]).map((r, i) => (
                <tr key={i}>
                  <TD className="whitespace-nowrap">{tanggal(r.waktu, true)}</TD>
                  <TD>{r.cakupan === 'tahun' ? 'Seluruh tahun' : ((p.baris as Data[]).find((b) => `pd:${b.skpdId}` === r.cakupan)?.namaPd ?? 'PD')}</TD>
                  <TD>{r.alasan}</TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        </Kartu>
      )}
    </>
  );
}
