import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { boleh, type StatusVerifikasi } from '@danboy/core';
import { hasilVerifikasi, LABEL_STATUS_VERIFIKASI } from '@danboy/core/services';
import { Rupiah, StatusBatch, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Masukan, Paginasi, Peringatan, Pilihan, Statistik, Tabel, TD, TH, TautanTombol, Tombol, cx } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';
import { CekUlang, CentangSipd, HapusVerifikasi, Pemantau } from './klien';
import { angka } from '@/lib/angka';

export const metadata: Metadata = { title: 'Hasil verifikasi SIPD' };

const NADA: Record<StatusVerifikasi, 'aman' | 'waspada' | 'bahaya' | 'info' | 'netral'> = {
  sesuai: 'aman',
  nilai_berbeda: 'waspada',
  sumber_dana_berbeda: 'bahaya',
  tidak_ada_di_sipd: 'info',
  tidak_ada_di_aplikasi: 'info',
};

interface Ringkasan {
  barisOk?: number;
  barisDitahan?: number;
  jumlah?: number;
  sesuai?: number;
  tidakSesuai?: number;
  totalPaguSipd?: number;
  totalPaguAplikasi?: number;
  perStatus?: Record<StatusVerifikasi, number>;
  perSkpd?: { kodeSkpd: string; namaSkpd: string; jumlah: number; tidakSesuai: number; perStatus: Record<StatusVerifikasi, number> }[];
  namaSumberDana?: Record<string, string>;
  kodeSdAsing?: string[];
}

interface Progres {
  tidakSesuai: number;
  ditandai: number;
  sisa: number;
  perSkpd: Record<string, { tidakSesuai: number; ditandai: number; sisa: number }>;
}

interface Hasil {
  _id: string;
  aturan: StatusVerifikasi;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  sebelum?: { pagu: number | null };
  sesudah?: { pagu: number | null };
  tindakLanjut?: { selesai: boolean; oleh?: { nama: string } | null; pada?: string | null } | null;
  verifikasi: {
    namaSkpd: string;
    namaSubUnit: string;
    baris: { kodeSumberDana: string; nilaiAplikasi: number; nilaiSipd: number; selisih: number }[];
  };
}

export default async function HasilVerifikasi({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: SP }) {
  const { batchId } = await params;
  const { user, sp } = await konteksHalaman(searchParams);
  const skpd = user.peran === 'skpd';
  const page = num(sp.page, 1);
  const status = (sp.status ?? 'tidak_sesuai') as StatusVerifikasi | 'tidak_sesuai' | '';
  // akun SKPD langsung melihat daftar pengingat yang belum dicentang
  const tandai = sp.tandai ?? (skpd ? 'belum' : '');
  const saringTandai = tandai === 'belum' || tandai === 'sudah' ? tandai : undefined;
  const r = await hasilVerifikasi(user, batchId, { status: status || undefined, tandai: saringTandai, skpd: sp.skpd, q: sp.q, page, limit: 50 }).catch(() => null);
  if (!r) notFound();
  const b = r.batch as unknown as { _id: string; namaFile: string; judul?: string | null; status: string; galat?: string; createdAt: string; progres: number; tahapanId?: { nama: string }; ringkasan: Ringkasan };
  const rk = b.ringkasan ?? {};
  const pg = r.tindakLanjut as unknown as Progres;
  const nama = rk.namaSumberDana ?? {};
  const berjalan = b.status === 'diunggah' || b.status === 'diproses';
  const bolehCentang = boleh(user, 'tandai_verifikasi');
  const param = { status: status || '', tandai: tandai || (skpd ? 'semua' : ''), skpd: sp.skpd, q: sp.q };
  const tautanTandai = (t: string) => {
    const q = new URLSearchParams(Object.entries({ status: 'tidak_sesuai', tandai: t, skpd: sp.skpd, q: sp.q }).filter(([, v]) => v) as [string, string][]);
    return `/verifikasi/${b._id}?${q}`;
  };
  const tabAktif = status === 'tidak_sesuai' ? (tandai || 'semua') : '';

  return (
    <>
      <Pemantau aktif={berjalan} />
      <KepalaHalaman
        judul={skpd ? 'Pengingat penyesuaian sumber dana di SIPD' : 'Hasil verifikasi input SIPD'}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBatch status={b.status} />
            <span>
              {b.judul ? <b className="text-teks">{b.judul}</b> : b.namaFile}
              {b.judul ? ` (${b.namaFile})` : ''} terhadap {b.tahapanId?.nama} · {tanggal(b.createdAt, true)}
            </span>
            <Link href="/verifikasi" className="text-utama hover:underline">
              ← Verifikasi
            </Link>
          </span>
        }
        aksi={
          (b.status === 'selesai' || b.status === 'gagal') && !skpd ? (
            <>
              {boleh(user, 'impor') && <HapusVerifikasi batchId={b._id} />}
              {b.status === 'selesai' && boleh(user, 'impor') && <CekUlang batchId={b._id} />}
              {b.status === 'selesai' && <TautanTombol href={`/api/verifikasi/${b._id}/ekspor`}>Unduh Excel</TautanTombol>}
            </>
          ) : undefined
        }
      />

      {berjalan && (
        <Kartu className="mb-4">
          <p className="text-sm font-medium">Membandingkan file SIPD dengan alokasi di aplikasi…</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-latar" role="progressbar" aria-valuenow={b.progres} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-utama transition-all" style={{ width: `${Math.max(3, b.progres)}%` }} />
          </div>
        </Kartu>
      )}
      {b.status === 'gagal' && (
        <div className="mb-4">
          <Peringatan nada="bahaya" judul="Verifikasi gagal">
            {b.galat}
          </Peringatan>
        </div>
      )}

      {b.status === 'selesai' && (
        <>
          {pg.tidakSesuai > 0 ? (
            <Kartu className="mb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {pg.sisa === 0
                    ? 'Semua subkegiatan sudah ditandai disesuaikan di SIPD'
                    : `${angka(pg.sisa)} subkegiatan${skpd ? '' : ' (semua SKPD)'} belum sama sumber dananya dan belum ditandai`}
                </p>
                <p className="text-sm text-redup">
                  {angka(pg.ditandai)} dari {angka(pg.tidakSesuai)} sudah ditandai
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-latar" role="progressbar" aria-label="Progres penyesuaian" aria-valuenow={pg.ditandai} aria-valuemin={0} aria-valuemax={pg.tidakSesuai}>
                <div className="h-full bg-aman transition-all" style={{ width: `${Math.round((pg.ditandai / pg.tidakSesuai) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-redup">
                {skpd
                  ? 'Sesuaikan sumber dana di SIPD seperti kolom "Seharusnya", lalu centang. Centang hanya pengingat untuk Anda; kepastiannya dicek ulang pada verifikasi berikutnya.'
                  : 'Centang diisi SKPD sebagai pengingat. Unggah ekspor SIPD terbaru untuk memastikan perbaikannya.'}
              </p>
            </Kartu>
          ) : (
            <div className="mb-4">
              <Peringatan nada="aman">{skpd && !rk.perSkpd?.length ? 'File ini tidak memuat data SKPD Anda.' : 'Input sumber dana di SIPD sudah sama dengan aplikasi.'}</Peringatan>
            </div>
          )}

          {!skpd && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Statistik label="Subkegiatan diperiksa" nilai={rk.jumlah ?? 0} sub={`${(rk.barisOk ?? 0).toLocaleString('id-ID')} baris SIPD${rk.barisDitahan ? ` · ${angka(rk.barisDitahan)} baris tidak valid` : ''}`} />
              <Statistik label="Sesuai" nilai={rk.sesuai ?? 0} nada="aman" />
              <Statistik label="Belum sesuai" nilai={rk.tidakSesuai ?? 0} nada={rk.tidakSesuai ? 'bahaya' : 'aman'} />
              <Statistik
                label="Total pagu SIPD vs aplikasi"
                nilai={<Rupiah nilai={rk.totalPaguSipd ?? 0} />}
                sub={
                  <>
                    aplikasi <Rupiah nilai={rk.totalPaguAplikasi ?? 0} />
                  </>
                }
              />
            </div>
          )}
          {!!rk.kodeSdAsing?.length && !skpd && (
            <div className="mb-4">
              <Peringatan nada="waspada">Kode sumber dana di file yang tidak ada di master aplikasi: {rk.kodeSdAsing.join(', ')}</Peringatan>
            </div>
          )}

          {!skpd && rk.perSkpd && rk.perSkpd.length > 0 && (
            <Kartu judul="Ringkasan per SKPD" padat className="mb-4">
              <Tabel>
                <thead>
                  <tr>
                    <TH>SKPD</TH>
                    <TH kanan>Subkegiatan</TH>
                    <TH kanan>Belum sesuai</TH>
                    <TH kanan>Ditandai SKPD</TH>
                    <TH kanan>Sumber dana beda</TH>
                    <TH kanan>Nilai beda</TH>
                    <TH kanan>Tidak di SIPD</TH>
                    <TH kanan>Tidak di aplikasi</TH>
                  </tr>
                </thead>
                <tbody>
                  {rk.perSkpd.map((s) => {
                    const p = pg.perSkpd[s.kodeSkpd];
                    return (
                      <tr key={s.kodeSkpd} className="hover:bg-latar/60">
                        <TD>
                          <Link href={`?status=tidak_sesuai&skpd=${encodeURIComponent(s.kodeSkpd)}`} className="hover:underline">
                            {s.namaSkpd}
                          </Link>
                        </TD>
                        <TD kanan>{angka(s.jumlah)}</TD>
                        <TD kanan className={cx('font-semibold', s.tidakSesuai ? 'text-bahaya' : 'text-aman')}>{angka(s.tidakSesuai)}</TD>
                        <TD kanan>{p ? `${angka(p.ditandai)}/${angka(p.tidakSesuai)}` : '–'}</TD>
                        <TD kanan>{s.perStatus.sumber_dana_berbeda ? angka(s.perStatus.sumber_dana_berbeda) : '–'}</TD>
                        <TD kanan>{s.perStatus.nilai_berbeda ? angka(s.perStatus.nilai_berbeda) : '–'}</TD>
                        <TD kanan>{s.perStatus.tidak_ada_di_sipd ? angka(s.perStatus.tidak_ada_di_sipd) : '–'}</TD>
                        <TD kanan>{s.perStatus.tidak_ada_di_aplikasi ? angka(s.perStatus.tidak_ada_di_aplikasi) : '–'}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabel>
            </Kartu>
          )}

          {pg.tidakSesuai > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Saring tanda">
              {[
                ['belum', `Belum ditandai (${angka(pg.sisa)})`],
                ['sudah', `Sudah disesuaikan (${angka(pg.ditandai)})`],
                ['semua', `Semua belum sesuai (${angka(pg.tidakSesuai)})`],
              ].map(([v, l]) => (
                <Link
                  key={v}
                  href={tautanTandai(v === 'semua' ? (skpd ? 'semua' : '') : v)}
                  className={cx(
                    'rounded-full border px-3 py-1',
                    tabAktif === v ? 'border-utama bg-utama-lembut font-medium text-utama' : 'border-garis bg-permukaan text-redup hover:text-teks',
                  )}
                >
                  {l}
                </Link>
              ))}
            </div>
          )}

          <form method="get" className="mb-3 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            <input type="hidden" name="tandai" value={tandai || (skpd ? 'semua' : '')} />
            <Masukan name="q" data-cari defaultValue={sp.q} placeholder="Kode atau nama subkegiatan  (tekan /)" aria-label="Cari" className="lg:w-64" />
            <Pilihan name="status" defaultValue={status} aria-label="Status" className="lg:w-64">
              <option value="tidak_sesuai">Semua yang belum sesuai</option>
              {(Object.keys(LABEL_STATUS_VERIFIKASI) as StatusVerifikasi[]).map((s) => (
                <option key={s} value={s}>
                  {LABEL_STATUS_VERIFIKASI[s]}
                  {!skpd && rk.perStatus ? ` (${angka(rk.perStatus[s])})` : ''}
                </option>
              ))}
              <option value="">Semua</option>
            </Pilihan>
            {!skpd && (
              <Pilihan name="skpd" defaultValue={sp.skpd ?? ''} aria-label="SKPD" className="lg:w-72">
                <option value="">Semua SKPD</option>
                {rk.perSkpd?.map((s) => (
                  <option key={s.kodeSkpd} value={s.kodeSkpd}>
                    {s.namaSkpd}
                  </option>
                ))}
              </Pilihan>
            )}
            <Tombol type="submit" varian="utama">
              Saring
            </Tombol>
          </form>

          <Kartu padat>
            {r.data.length ? (
              <>
                <ul className="divide-y divide-garis">
                  {(r.data as unknown as Hasil[]).map((h) => {
                    const sudah = !!h.tindakLanjut?.selesai;
                    return (
                      <li key={h._id} className={cx('grid gap-3 px-4 py-3 lg:grid-cols-[auto_1fr_42rem]', sudah && 'bg-latar/50')}>
                        <div className="pt-0.5">
                          {h.aturan !== 'sesuai' && bolehCentang ? (
                            <CentangSipd batchId={b._id} hasilId={h._id} awal={sudah} label={`${h.kodeSubkegiatan} ${h.namaSubkegiatan}`} />
                          ) : (
                            <span className="block w-5" />
                          )}
                        </div>
                        <div className={cx('min-w-0', sudah && 'opacity-70')}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Lencana nada={NADA[h.aturan]}>{LABEL_STATUS_VERIFIKASI[h.aturan]}</Lencana>
                            {sudah && <Lencana nada="aman">Sudah disesuaikan di SIPD</Lencana>}
                          </div>
                          <p className="mt-1.5 font-mono text-xs text-redup">{h.kodeSubkegiatan}</p>
                          <p className={cx('font-medium', sudah && 'line-through decoration-redup/60')}>{h.namaSubkegiatan}</p>
                          <p className="text-sm text-redup">
                            {h.verifikasi.namaSkpd}
                            {h.verifikasi.namaSubUnit !== h.verifikasi.namaSkpd && ` › ${h.verifikasi.namaSubUnit}`}
                          </p>
                          {sudah && h.tindakLanjut?.pada && (
                            <p className="mt-1 text-xs text-redup">
                              Ditandai {h.tindakLanjut.oleh?.nama ?? ''} · {tanggal(h.tindakLanjut.pada, true)}
                            </p>
                          )}
                          {h.sebelum?.pagu != null && h.sesudah?.pagu != null && h.sebelum.pagu !== h.sesudah.pagu && (
                            <p className="mt-1 text-sm">
                              Pagu aplikasi <Rupiah nilai={h.sebelum.pagu} /> · SIPD <Rupiah nilai={h.sesudah.pagu} />
                            </p>
                          )}
                        </div>
                        <div className={cx('min-w-0', sudah && 'opacity-70')}>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-redup">
                                <th scope="col" className="pb-1 text-left font-medium">
                                  Sumber dana
                                </th>
                                <th scope="col" className="pb-1 text-right font-medium">
                                  Seharusnya
                                </th>
                                <th scope="col" className="pb-1 text-right font-medium">
                                  Di SIPD
                                </th>
                                <th scope="col" className="pb-1 text-right font-medium">
                                  Selisih
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {h.verifikasi.baris.map((x) => (
                                <tr key={x.kodeSumberDana} className={cx(x.selisih !== 0 && !sudah && 'bg-waspada-lembut')}>
                                  <td className="py-0.5 pr-2">
                                    <span className="font-mono text-xs text-redup">{x.kodeSumberDana}</span>
                                    {nama[x.kodeSumberDana] && nama[x.kodeSumberDana] !== x.kodeSumberDana ? ` ${nama[x.kodeSumberDana]}` : ''}
                                  </td>
                                  <td className="angka py-0.5 text-right">
                                    <Rupiah nilai={x.nilaiAplikasi} />
                                  </td>
                                  <td className="angka py-0.5 text-right">
                                    <Rupiah nilai={x.nilaiSipd} />
                                  </td>
                                  <td className={cx('angka py-0.5 text-right font-medium', x.selisih === 0 ? 'text-redup' : 'text-bahaya')}>
                                    {x.selisih === 0 ? '–' : <Rupiah nilai={x.selisih} negatifMerah={false} />}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Paginasi total={r.total} page={page} limit={50} dasar={`/verifikasi/${b._id}`} param={param} />
              </>
            ) : (
              <Kosong judul={tandai === 'belum' ? 'Tidak ada lagi yang perlu disesuaikan' : status === 'tidak_sesuai' ? 'Semua sudah sesuai' : 'Tidak ada data'}>
                {tandai === 'belum' && pg.tidakSesuai > 0 && 'Semua subkegiatan sudah Anda tandai disesuaikan di SIPD.'}
              </Kosong>
            )}
          </Kartu>
        </>
      )}
    </>
  );
}
