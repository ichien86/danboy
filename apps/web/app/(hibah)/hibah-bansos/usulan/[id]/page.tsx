import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { bolehHibah, KODE_ASPEK, LABEL_ASPEK, LABEL_STATUS_USULAN, type StatusUsulan } from '@danboy/core';
import { berkasWajibUntuk, detailUsulan, opsiHibah } from '@danboy/core/services';
import { Rupiah, tanggal } from '@/components/domain';
import { LencanaStatus, TombolAksi } from '@/components/hibah';
import { DaftarBerkas, UnggahDenganJenis } from '@/components/hibah-berkas';
import { Kartu, KepalaHalaman, Lencana, Peringatan, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { FormEvaluasi, FormVerifikasi } from '../evaluasi';
import { FormUsulan } from '../form';

export const metadata: Metadata = { title: 'Usulan' };

const durasi = (ms: number) => {
  const hari = Math.floor(ms / 86_400_000);
  const jam = Math.floor((ms % 86_400_000) / 3_600_000);
  return hari ? `${hari} hari ${jam} jam` : `${jam} jam`;
};

export default async function DetailUsulan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await halamanHibah('hibah_lihat_usulan');
  const u = (await detailUsulan(user, id)) as Data;
  const [opsi, wajibUsulan] = (await Promise.all([opsiHibah(user), berkasWajibUntuk(user, u.jenisPenerimaKode, 'usulan')])) as [Data, Data[]];
  const tujuan = (opsi.tujuan as Data[]).find((t) => t.kode === u.tujuanBansosKode);
  const status = u.status as StatusUsulan;
  const bisaKirim = u.hak.ubah && (status === 'draf' || status === 'perbaikan');
  const label = Object.fromEntries((u.berkasWajib as Data[]).map((b) => [b.kode, b.nama]));
  const riwayat = (u.riwayatStatus as Data[]).map((r, i, a): Data => ({ ...r, lama: (i + 1 < a.length ? +new Date(a[i + 1].waktu) : Date.now()) - +new Date(r.waktu) }));
  return (
    <>
      <KepalaHalaman
        judul={`${u.nomor} · ${u.penerima?.nama ?? ''}`}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LencanaStatus status={status} />
            <span>{u.namaPd}</span>
            <span>·</span>
            <span>{u.jenis?.nama}</span>
            <span>·</span>
            <span>{u.bentuk === 'uang' ? 'Uang' : 'Barang'}</span>
            {u.terkunci && <Lencana nada="info">hasil terkunci</Lencana>}
          </span>
        }
        aksi={
          <>
            {u.hak.ubah && <FormUsulan opsi={opsi as { jenis: Data[]; tujuan: Data[]; rekening: Data[] }} awal={u} />}
            {status === 'draf' && u.hak.ubah && (
              <TombolAksi url={`/api/hibah/usulan/${u._id}`} method="DELETE" label="Hapus" varian="bahaya" kecil={false} konfirmasi="Hapus usulan draf ini?" berhasil="Usulan dihapus" ke="/hibah-bansos/usulan" />
            )}
            {bisaKirim && (
              <TombolAksi
                url={`/api/hibah/usulan/${u._id}/kirim`}
                body={{ updatedAt: u.updatedAt }}
                label={status === 'draf' ? 'Kirim ke evaluasi' : 'Kirim ulang ke TAPD'}
                varian="utama"
                kecil={false}
                konfirmasi={status === 'draf' ? 'Kirim usulan ke evaluasi PD? Kelengkapan berkas dan rincian akan diperiksa.' : 'Kirim ulang ke TAPD tanpa mengubah nilai rekomendasi?'}
                berhasil={status === 'draf' ? 'Usulan masuk evaluasi PD' : 'Dikirim ulang ke TAPD'}
              />
            )}
            {u.hak.ubah && (status === 'layak' || status === 'tidak_layak') && (
              <TombolAksi url={`/api/hibah/usulan/${u._id}/kesimpulan`} body={{ updatedAt: u.updatedAt, kesimpulan: null }} label="Buka kembali evaluasi" kecil={false} berhasil="Evaluasi dibuka kembali" />
            )}
          </>
        }
      />
      {!u.hak.dalamJadwalPd && u.hak.ubah && <Peringatan nada="waspada">Di luar jadwal tahapan untuk status ini; perubahan akan ditolak kecuali PD Anda diberi perpanjangan.</Peringatan>}
      {u.status === 'perbaikan' && u.verifikasi?.alasan && (
        <Peringatan nada="waspada" judul="Dikembalikan TAPD untuk perbaikan">
          {u.verifikasi.alasan}
        </Peringatan>
      )}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Kartu judul="Data usulan" className="xl:col-span-2">
          <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-redup">Calon penerima</dt>
            <dd>
              <Link href={`/hibah-bansos/penerima/${u.penerimaId}`} className="text-utama hover:underline">
                {u.penerima?.nama}
              </Link>{' '}
              <span className="font-mono text-xs text-redup">{u.penerima?.identitas?.samaran}</span>
            </dd>
            <dt className="text-redup">Subkegiatan</dt>
            <dd>{u.subkegiatanKode ? `${u.subkegiatanKode} ${u.subkegiatanNama}` : '–'}</dd>
            <dt className="text-redup">Rekening</dt>
            <dd className="font-mono text-xs">{u.kodeRekening || '–'}</dd>
            <dt className="text-redup">{u.kelompok === 'bansos' ? 'Tujuan bansos' : 'Peruntukan'}</dt>
            <dd>{u.kelompok === 'bansos' ? (tujuan?.nama ?? '–') : u.peruntukan || '–'}</dd>
            <dt className="text-redup">Proposal</dt>
            <dd>
              {u.proposal?.nomor || '–'} {u.proposal?.tanggal && <span className="text-redup">· {tanggal(u.proposal.tanggal)}</span>}
            </dd>
            {u.rekomendasi && (
              <>
                <dt className="text-redup">Dokumen rekomendasi</dt>
                <dd>
                  <Link href={`/hibah-bansos/rekomendasi/${u.rekomendasi._id}`} className="text-utama hover:underline">
                    {u.rekomendasi.nomor}
                  </Link>{' '}
                  <Lencana>{u.rekomendasi.status === 'diunggah' ? 'sudah diunggah' : 'draf'}</Lencana>
                </dd>
              </>
            )}
          </dl>
        </Kartu>
        <Kartu judul="Nilai">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-redup">Nilai usulan</dt>
              <dd className="font-semibold">
                <Rupiah nilai={u.nilaiUsulan} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-redup">Rekomendasi PD</dt>
              <dd className="font-semibold">
                <Rupiah nilai={u.nilaiRekomendasi} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-redup">Disetujui TAPD</dt>
              <dd className="font-semibold">
                <Rupiah nilai={u.nilaiDisetujui} />
              </dd>
            </div>
          </dl>
        </Kartu>

        <Kartu judul="Rincian aktivitas" padat className="xl:col-span-2">
          <Tabel>
            <thead>
              <tr>
                <TH>{u.bentuk === 'barang' ? 'Barang' : 'Uraian'}</TH>
                <TH kanan>Volume</TH>
                <TH>Satuan</TH>
                <TH kanan>Harga satuan</TH>
                <TH kanan>Jumlah</TH>
                <TH kanan>Rekomendasi</TH>
              </tr>
            </thead>
            <tbody>
              {u.rincian.map((r: Data) => (
                <tr key={r._id}>
                  <TD>
                    {r.uraian}
                    {r.spesifikasi && <p className="text-xs text-redup">{r.spesifikasi}</p>}
                    {r.catatanRekomendasi && <p className="text-xs text-redup">Catatan PD: {r.catatanRekomendasi}</p>}
                  </TD>
                  <TD kanan>{Number(r.volume).toLocaleString('id-ID')}</TD>
                  <TD>{r.satuan}</TD>
                  <TD kanan>
                    <Rupiah nilai={r.hargaSatuan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={r.jumlah} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={r.nilaiRekomendasi} />
                  </TD>
                </tr>
              ))}
              {!u.rincian.length && (
                <tr>
                  <TD colSpan={6} className="py-6 text-center text-redup">
                    Belum ada rincian
                  </TD>
                </tr>
              )}
            </tbody>
          </Tabel>
        </Kartu>
        <Kartu judul="Kelengkapan berkas">
          <ul className="space-y-1 text-sm">
            {(u.berkasWajib as Data[]).map((b) => (
              <li key={`${b.tingkat}-${b.kode}`} className="flex items-center gap-2">
                {b.ada ? <CheckCircle2 className="size-4 text-aman" aria-label="Ada" /> : <CircleDashed className="size-4 text-bahaya" aria-label="Belum ada" />}
                <span className={b.ada ? '' : 'text-bahaya'}>{b.nama}</span>
                <span className="text-xs text-redup">{b.tingkat === 'penerima' ? 'kartu penerima' : 'usulan'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-garis pt-3">
            <DaftarBerkas berkas={u.berkas} bisaHapus={u.hak.ubah} label={label} />
            {u.berkasSensitifTersembunyi > 0 && <p className="mt-1 text-xs text-redup">{u.berkasSensitifTersembunyi} berkas KTP/KK hanya bisa dibuka Operator PD pemilik dan Verifikator.</p>}
          </div>
          {u.hak.ubah && (
            <div className="mt-3 border-t border-garis pt-3">
              <UnggahDenganJenis pemilikJenis="usulan" pemilikId={u._id} jenis={wajibUsulan.map((w) => ({ kode: w.kode, nama: w.nama }))} />
              <p className="mt-2 text-xs text-redup">
                Berkas kartu penerima (akta, KTP, domisili) diunggah di{' '}
                <Link href={`/hibah-bansos/penerima/${u.penerimaId}`} className="text-utama hover:underline">
                  kartu penerima
                </Link>
                .
              </p>
            </div>
          )}
        </Kartu>

        {(u.hak.evaluasi || u.evaluasi?.checklist?.length > 0) && (
          <Kartu judul="Evaluasi PD" className="xl:col-span-3">
            {u.hak.evaluasi ? (
              <FormEvaluasi u={u} />
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  Kesimpulan:{' '}
                  {u.evaluasi.kesimpulan ? <Lencana nada={u.evaluasi.kesimpulan === 'layak' ? 'aman' : 'bahaya'}>{u.evaluasi.kesimpulan === 'layak' ? 'Layak' : 'Tidak layak'}</Lencana> : '–'}{' '}
                  {u.evaluasi.waktu && <span className="text-redup">· {tanggal(u.evaluasi.waktu, true)}</span>}
                </p>
                {u.peringatan?.map((p: Data) => (
                  <Peringatan key={p.kode} nada="waspada" judul={p.pesan}>
                    <ul className="list-disc pl-4 text-xs">
                      {p.sumber.map((s: Data) => (
                        <li key={`${s.jenis}-${s.id}`}>{s.label}</li>
                      ))}
                    </ul>
                    <p className="mt-1">Catatan PD: {p.catatanOperator || '–'}</p>
                  </Peringatan>
                ))}
                <ol className="divide-y divide-garis rounded-md border border-garis">
                  {u.evaluasi.checklist.map((b: Data, i: number) => (
                    <li key={b.butirId} className="flex gap-3 p-2.5">
                      <span className="flex-1">
                        {i + 1}. {b.pertanyaan}
                        {b.catatan && <span className="block text-xs text-redup">{b.catatan}</span>}
                      </span>
                      <Lencana nada={b.jawaban === 'ya' ? 'aman' : b.jawaban === 'tidak' ? 'bahaya' : 'netral'}>{b.jawaban === 'ya' ? 'Ya' : b.jawaban === 'tidak' ? 'Tidak' : '–'}</Lencana>
                    </li>
                  ))}
                </ol>
                {u.evaluasi.catatan && <p className="text-redup">Catatan: {u.evaluasi.catatan}</p>}
              </div>
            )}
          </Kartu>
        )}

        {(u.hak.verifikasi || u.verifikasi?.keputusan) && (
          <Kartu judul="Verifikasi TAPD" className="xl:col-span-2">
            {u.hak.verifikasi ? (
              <FormVerifikasi u={u} />
            ) : (
              <div className="space-y-2 text-sm">
                <ul className="space-y-1">
                  {KODE_ASPEK.map((k) => {
                    const a = (u.verifikasi.aspek as Data[]).find((x) => x.kode === k);
                    return (
                      <li key={k} className="flex gap-2">
                        <span className="flex-1">{LABEL_ASPEK[k]}</span>
                        <Lencana nada={a?.memenuhi ? 'aman' : a?.memenuhi === false ? 'bahaya' : 'netral'}>{a?.memenuhi ? 'Memenuhi' : a?.memenuhi === false ? 'Tidak memenuhi' : '–'}</Lencana>
                      </li>
                    );
                  })}
                </ul>
                <p>
                  Keputusan: <strong>{u.verifikasi.keputusan ? LABEL_STATUS_USULAN[u.verifikasi.keputusan as StatusUsulan] : '–'}</strong>
                </p>
                {u.verifikasi.alasan && <p className="text-redup">Alasan: {u.verifikasi.alasan}</p>}
              </div>
            )}
          </Kartu>
        )}

        <Kartu judul="Riwayat status" className={u.hak.verifikasi || u.verifikasi?.keputusan ? '' : 'xl:col-span-3'}>
          <ol className="space-y-2 text-sm">
            {riwayat.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <LencanaStatus status={r.status} />
                <span className="text-xs text-redup">{tanggal(r.waktu, true)}</span>
                <span className="text-xs text-redup">· {i + 1 < riwayat.length ? durasi(r.lama) : `${durasi(r.lama)} hingga kini`}</span>
                {r.catatan && <span className="w-full text-xs text-redup">{r.catatan}</span>}
              </li>
            ))}
          </ol>
        </Kartu>
      </div>
      {bolehHibah(user, 'hibah_verifikasi') && !u.hak.verifikasi && !u.verifikasi?.keputusan && (
        <p className="mt-4 text-sm text-redup">Verifikasi TAPD tersedia setelah PD mengunggah dokumen rekomendasi bertanda tangan.</p>
      )}
    </>
  );
}
