import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { daftarBeritaAcara, tahunAktifAtauNull } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { UnggahBerkas } from '@/components/hibah';
import { Kartu, KepalaHalaman, Kosong, Lencana, Peringatan, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { FormBeritaAcara } from './form';

export const metadata: Metadata = { title: 'Berita Acara' };

const unduh = (href: string, label: string) => (
  <a href={href} className="inline-flex items-center gap-1 rounded border border-garis px-2 py-1 text-xs hover:bg-latar">
    <Download className="size-3" aria-hidden /> {label}
  </a>
);

/** FR-43–46: Berita Acara dan Lampiran I–II (.docx) dari hasil terkunci; daftar Lampiran 3a/3b dan 4a/4b Perkada (Excel). */
export default async function HalamanBeritaAcara() {
  const { user, operator } = await halamanHibah('hibah_lihat_rekap');
  if (operator) notFound();
  const t = await tahunAktifAtauNull();
  if (!t) return <Kartu><Kosong judul="Belum ada tahun anggaran aktif" /></Kartu>;
  const d = (await daftarBeritaAcara(user, t.tahun)) as Data;
  const pdTerkunci = (d.pd as Data[]).filter((p) => p.terkunci);
  return (
    <>
      <KepalaHalaman
        judul="Berita Acara"
        sub={`Berita Acara Verifikasi TAPD TA ${d.tahun} dicetak dari hasil yang sudah dikunci. Angka BA, lampiran, dan rekap berasal dari sumber yang sama.`}
        aksi={d.bolehCetak ? <FormBeritaAcara tahun={d.tahun} kunciTahun={d.kunciTahun} pd={pdTerkunci.map((p) => ({ _id: p.skpdId, nama: p.namaPd }))} /> : undefined}
      />
      {!d.kunciTahun && !pdTerkunci.length && <Peringatan nada="info">Belum ada hasil yang dikunci. Kunci hasil per PD atau seluruh tahun di menu Kunci Hasil.</Peringatan>}
      <Kartu judul="Berita Acara" padat className="mt-4">
        {d.beritaAcara.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Nomor</TH>
                <TH>Tanggal</TH>
                <TH>Cakupan</TH>
                <TH>Status</TH>
                <TH>Dokumen</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {d.beritaAcara.map((b: Data) => (
                <tr key={b._id} className={b.status === 'usang' ? 'opacity-60' : ''}>
                  <TD className="font-medium">{b.nomor}</TD>
                  <TD className="whitespace-nowrap">{tanggal(b.tanggal)}</TD>
                  <TD>{b.cakupan.semua ? 'Seluruh PD' : `${b.cakupan.skpdIds.length} PD`}</TD>
                  <TD>
                    <Lencana nada={b.status === 'diunggah' ? 'aman' : b.status === 'usang' ? 'bahaya' : 'waspada'}>
                      {b.status === 'diunggah' ? 'Bertanda tangan diunggah' : b.status === 'usang' ? 'Usang, cetak ulang' : 'Draf'}
                    </Lencana>
                  </TD>
                  <TD>
                    {b.status !== 'usang' && (
                      <div className="flex flex-wrap gap-1">
                        {unduh(`/api/hibah/berita-acara/${b._id}/unduh?bagian=ba`, 'Berita Acara')}
                        {unduh(`/api/hibah/berita-acara/${b._id}/unduh?bagian=lampiran-1`, 'Lampiran I (hibah)')}
                        {unduh(`/api/hibah/berita-acara/${b._id}/unduh?bagian=lampiran-2`, 'Lampiran II (bansos)')}
                        {b.berkasId && unduh(`/api/hibah/berkas/${b.berkasId}`, 'Pindaian bertanda tangan')}
                      </div>
                    )}
                  </TD>
                  <TD>{d.bolehCetak && b.status === 'draf' && <UnggahBerkas url={`/api/hibah/berita-acara/${b._id}/unggah`} label="Unggah bertanda tangan" berhasil="Berita Acara bertanda tangan diunggah" />}</TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada Berita Acara" />
        )}
      </Kartu>
      {d.bolehCetak && (
        <Kartu judul="Daftar penerima format Perkada (Excel)" className="mt-4">
          <p className="mb-2 text-sm text-redup">Usulan disetujui dari hasil terkunci: nama, alamat, dan besaran. Lampiran a = berupa uang, b = berupa barang.</p>
          <div className="flex flex-wrap gap-2">
            {(['3a', '3b', '4a', '4b'] as const).map((j) => (
              <a key={j} href={`/api/hibah/lampiran-perkada/${j}?tahun=${d.tahun}`} className="inline-flex items-center gap-1.5 rounded-md border border-garis px-3 py-1.5 text-sm hover:bg-latar">
                <Download className="size-3.5" aria-hidden /> Lampiran {j.toUpperCase()} ({j.startsWith('3') ? 'hibah' : 'bansos'}, {j.endsWith('a') ? 'uang' : 'barang'})
              </a>
            ))}
          </div>
        </Kartu>
      )}
      <Kartu judul="Kesiapan per Perangkat Daerah" padat className="mt-4">
        <Tabel>
          <thead>
            <tr>
              <TH>Perangkat Daerah</TH>
              <TH kanan>Sudah diputus</TH>
              <TH kanan>Belum diputus</TH>
              <TH>Kunci</TH>
            </tr>
          </thead>
          <tbody>
            {(d.pd as Data[]).map((p) => (
              <tr key={p.skpdId}>
                <TD>{p.namaPd}</TD>
                <TD kanan>{p.final}</TD>
                <TD kanan className={p.belum ? 'text-waspada' : ''}>{p.belum}</TD>
                <TD>{p.terkunci ? <Lencana nada="info">Terkunci</Lencana> : <Lencana>Terbuka</Lencana>}</TD>
              </tr>
            ))}
          </tbody>
        </Tabel>
      </Kartu>
    </>
  );
}
