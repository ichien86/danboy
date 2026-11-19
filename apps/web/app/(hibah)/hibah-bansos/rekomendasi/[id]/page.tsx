import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import type { StatusUsulan } from '@danboy/core';
import { detailRekomendasi } from '@danboy/core/services';
import { Rupiah, tanggal } from '@/components/domain';
import { LencanaStatus, TombolAksi, UnggahBerkas } from '@/components/hibah';
import { Kartu, KepalaHalaman, Lencana, Peringatan, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { FormRekomendasi } from '../form';

export const metadata: Metadata = { title: 'Dokumen Rekomendasi' };

export default async function DetailRekomendasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await halamanHibah('hibah_lihat_usulan');
  const r = (await detailRekomendasi(user, id)) as Data;
  const draf = r.status === 'draf';
  const total = (r.usulan as Data[]).reduce((a, u) => ({ usulan: a.usulan + u.nilaiUsulan, rek: a.rek + u.nilaiRekomendasi }), { usulan: 0, rek: 0 });
  void user;
  return (
    <>
      <KepalaHalaman
        judul={`Rekomendasi ${r.nomor}`}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Lencana nada={draf ? 'waspada' : 'aman'}>{draf ? 'Draf, belum ditandatangani' : 'Sudah diunggah'}</Lencana>
            <span>{r.namaPd}</span>
            <span>· {tanggal(r.tanggal)}</span>
            <Link href="/hibah-bansos/rekomendasi" className="text-utama hover:underline">
              ← Semua dokumen
            </Link>
          </span>
        }
        aksi={
          <>
            <a href={`/api/hibah/rekomendasi/${r._id}/unduh`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-garis px-3 text-sm hover:bg-latar">
              <Download className="size-3.5" aria-hidden /> Unduh .docx
            </a>
            {draf && r.pemilik && (
              <>
                <FormRekomendasi awal={r} />
                <TombolAksi url={`/api/hibah/rekomendasi/${r._id}/batal`} label="Batalkan" varian="bahaya" kecil={false} konfirmasi="Batalkan dokumen ini? Usulan di dalamnya kembali berstatus Layak." berhasil="Dokumen dibatalkan" ke="/hibah-bansos/rekomendasi" />
                <UnggahBerkas url={`/api/hibah/rekomendasi/${r._id}/unggah`} label="Unggah hasil bertanda tangan" varian="utama" kecil={false} berhasil="Rekomendasi diunggah; usulan terkunci dan sampai ke TAPD" />
              </>
            )}
          </>
        }
      />
      {draf && r.pemilik && (
        <Peringatan nada="info" judul="Langkah berikutnya">
          1. Unduh .docx (kop surat dari templat PD Anda). 2. Tandatangani Kepala PD, basah atau elektronik. 3. Unggah hasilnya (PDF/JPG/PNG, maks. 5 MB). Setelah diunggah, dokumen dan usulan di dalamnya tidak bisa diubah kecuali dikembalikan TAPD.
        </Peringatan>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Kartu judul={`Usulan (${r.usulan.length})`} padat className="xl:col-span-2">
          <Tabel>
            <thead>
              <tr>
                <TH>Nomor</TH>
                <TH>Penerima</TH>
                <TH>Status</TH>
                <TH kanan>Usulan</TH>
                <TH kanan>Rekomendasi</TH>
              </tr>
            </thead>
            <tbody>
              {r.usulan.map((u: Data) => (
                <tr key={u._id}>
                  <TD>
                    <Link href={`/hibah-bansos/usulan/${u._id}`} className="text-utama hover:underline">
                      {u.nomor}
                    </Link>
                  </TD>
                  <TD>{u.namaPenerima}</TD>
                  <TD>
                    <LencanaStatus status={u.status as StatusUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiRekomendasi} />
                  </TD>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <TD className="font-medium" colSpan={3}>
                  Jumlah
                </TD>
                <TD kanan className="font-semibold">
                  <Rupiah nilai={total.usulan} />
                </TD>
                <TD kanan className="font-semibold">
                  <Rupiah nilai={total.rek} />
                </TD>
              </tr>
            </tfoot>
          </Tabel>
        </Kartu>
        <Kartu judul="Dokumen">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-redup">Perihal</dt>
              <dd>{r.perihal}</dd>
            </div>
            <div>
              <dt className="text-redup">Kepala PD</dt>
              <dd>
                {r.kepalaPd?.nama || '–'} {r.kepalaPd?.nip && <span className="text-redup">· NIP {r.kepalaPd.nip}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-redup">Hasil bertanda tangan</dt>
              <dd>
                {r.berkas ? (
                  <a href={`/api/hibah/berkas/${r.berkas._id}`} target="_blank" rel="noopener" className="text-utama hover:underline">
                    {r.berkas.nama}
                  </a>
                ) : (
                  'Belum diunggah'
                )}
              </dd>
            </div>
          </dl>
        </Kartu>
      </div>
    </>
  );
}
