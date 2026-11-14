'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LABEL_ATURAN, StatusBatch, tanggal } from '@/components/domain';
import { useToast } from '@/components/klien';
import { Kartu, KepalaHalaman, Kosong, Lencana, Peringatan, Statistik, Tabel, TD, TH, Tombol, cx } from '@/components/ui';
import { api, pesanGalat, rp } from '@/lib/klien';

interface Batch {
  _id: string;
  jenis: string;
  namaFile: string;
  status: string;
  progres: number;
  galat?: string | null;
  createdAt: string;
  diterapkanPada?: string | null;
  olehId?: { nama: string };
  tahapanId?: { _id: string; nama: string; status: string } | null;
  ringkasan: Record<string, unknown> & {
    operasi?: Record<string, number>;
    temuan?: Record<string, number>;
    kodeAsing?: { subkegiatan: string[]; sumberDana: string[] };
    peringatan?: string[];
    sedangDiterapkan?: boolean;
    hasilTerapkan?: { disisipkan: number; diperbarui: number; dilewatiKarenaBerubah: number };
  };
}
interface Halaman {
  batch: Batch;
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

const ATURAN_FILTER = ['R7', 'R1', 'R2', 'R8', 'R0'];

export function DetailImpor({ batchId, awal }: { batchId: string; awal: Batch }) {
  const [b, setB] = useState(awal);
  const [bagian, setBagian] = useState<'hasil' | 'ditahan' | 'baris'>(awal.jenis === 'apbd' ? 'hasil' : 'baris');
  const [aturan, setAturan] = useState('');
  const [page, setPage] = useState(1);
  const [daftar, setDaftar] = useState<Halaman | null>(null);
  const [aksi, setAksi] = useState('');
  const toast = useToast();
  const router = useRouter();
  const berjalan = b.status === 'diunggah' || b.status === 'diproses' || !!b.ringkasan?.sedangDiterapkan;

  // polling progres setiap 1 detik selama diproses
  useEffect(() => {
    if (!berjalan) return;
    const t = setInterval(() => {
      api<Halaman>(`/api/impor/${batchId}`)
        .then((r) => setB(r.batch))
        .catch(() => {});
    }, 1000);
    return () => clearInterval(t);
  }, [berjalan, batchId]);

  const muatDaftar = useCallback(() => {
    if (b.status !== 'pratinjau' && b.status !== 'diterapkan') return;
    const q = new URLSearchParams({ bagian, page: String(page), limit: '50' });
    if (aturan) q.set('aturan', aturan);
    api<Halaman>(`/api/impor/${batchId}?${q}`)
      .then(setDaftar)
      .catch(() => setDaftar(null));
  }, [b.status, bagian, page, aturan, batchId]);
  useEffect(() => {
    if (!berjalan) muatDaftar();
  }, [muatDaftar, berjalan]);

  const jalankan = async (nama: string, path: string, pesan: string) => {
    setAksi(nama);
    try {
      await api(`/api/impor/${batchId}/${path}`, { method: 'POST' });
      toast(pesan);
      const r = await api<Halaman>(`/api/impor/${batchId}`);
      setB(r.batch);
      router.refresh();
    } catch (e) {
      toast(pesanGalat(e), 'bahaya');
    } finally {
      setAksi('');
    }
  };

  const r = b.ringkasan ?? {};
  const apbd = b.jenis === 'apbd';
  const totalOp = r.operasi ? Object.values(r.operasi).reduce((x, y) => x + y, 0) : 0;

  return (
    <>
      <KepalaHalaman
        judul={b.namaFile}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBatch status={b.status} />
            {b.tahapanId?.nama && <span>{b.tahapanId.nama}</span>}
            <span>
              diunggah {b.olehId?.nama} · {tanggal(b.createdAt, true)}
            </span>
            <Link href="/impor" className="text-utama hover:underline">
              ← Riwayat impor
            </Link>
          </span>
        }
        aksi={
          b.status === 'pratinjau' && !r.sedangDiterapkan ? (
            <>
              <Tombol onClick={() => jalankan('batal', 'batal', 'Pratinjau dibatalkan')} memuat={aksi === 'batal'} disabled={!!aksi}>
                Batalkan
              </Tombol>
              <Tombol onClick={() => jalankan('ulang', 'proses-ulang', 'Diproses ulang')} memuat={aksi === 'ulang'} disabled={!!aksi}>
                Proses ulang
              </Tombol>
              <Tombol varian="utama" onClick={() => jalankan('terapkan', 'terapkan', 'Sedang diterapkan…')} memuat={aksi === 'terapkan'} disabled={!!aksi}>
                {r.tidakAdaPerubahan ? 'Tandai selesai' : `Terapkan ${totalOp ? `${totalOp} perubahan` : ''}`}
              </Tombol>
            </>
          ) : b.status === 'gagal' ? (
            <Tombol onClick={() => jalankan('ulang', 'proses-ulang', 'Diproses ulang')} memuat={aksi === 'ulang'}>
              Proses ulang
            </Tombol>
          ) : undefined
        }
      />

      {berjalan && (
        <Kartu className="mb-4">
          <p className="text-sm font-medium">{r.sedangDiterapkan ? 'Menerapkan perubahan dalam satu transaksi…' : 'Memproses file…'}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-latar" role="progressbar" aria-valuenow={b.progres} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-utama transition-all" style={{ width: `${r.sedangDiterapkan ? 100 : Math.max(3, b.progres)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-redup">{typeof r.barisDibaca === 'number' ? `${r.barisDibaca.toLocaleString('id-ID')} baris dibaca` : `${b.progres}%`}</p>
        </Kartu>
      )}

      {b.status === 'gagal' && b.galat && (
        <div className="mb-4">
          <Peringatan nada="bahaya" judul="Impor gagal">
            {b.galat}
          </Peringatan>
        </div>
      )}
      {b.status === 'diterapkan' && (
        <div className="mb-4">
          <Peringatan nada="aman" judul="Sudah diterapkan">
            {tanggal(b.diterapkanPada, true)}
            {r.hasilTerapkan &&
              ` · ${r.hasilTerapkan.disisipkan} ditambah, ${r.hasilTerapkan.diperbarui} diperbarui${r.hasilTerapkan.dilewatiKarenaBerubah ? `, ${r.hasilTerapkan.dilewatiKarenaBerubah} dilewati karena diubah Admin setelah pratinjau` : ''}`}
          </Peringatan>
        </div>
      )}
      {typeof r.pesan === 'string' && (
        <div className="mb-4">
          <Peringatan nada="info">{r.pesan}</Peringatan>
        </div>
      )}
      {r.peringatan?.map((p) => (
        <div key={p} className="mb-2">
          <Peringatan nada="waspada">{p}</Peringatan>
        </div>
      ))}

      {!berjalan && apbd && typeof r.barisTotal === 'number' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Statistik label="Baris dibaca" nilai={(r.barisTotal as number).toLocaleString('id-ID')} sub={`${r.barisOk} ok · ${r.barisDitahan} ditahan`} nada={(r.barisDitahan as number) ? 'waspada' : undefined} />
            <Statistik label="Total PAGU file" nilai={rp(r.totalPaguFile as number)} sub={`ok: ${rp(r.totalPaguOk as number)}`} />
            <Statistik label="Subkegiatan di file" nilai={r.jumlahSubkegiatanFile as number} sub={`tersimpan: ${r.jumlahSubkegiatanTersimpan}`} />
            <Statistik
              label="Rencana perubahan"
              nilai={totalOp}
              sub={r.operasi ? `${r.operasi.tambah} baru · ${r.operasi.ubah} ubah · ${r.operasi.tandai_hilang} hilang` : undefined}
            />
          </div>
          {r.temuan && Object.keys(r.temuan).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {Object.entries(r.temuan).map(([k, v]) => (
                <Lencana key={k} nada={k === 'R2' || k === 'R8' ? 'waspada' : 'info'}>
                  {k} {LABEL_ATURAN[k]}: {v}
                </Lencana>
              ))}
            </div>
          )}
          {r.kodeAsing && (r.kodeAsing.subkegiatan.length > 0 || r.kodeAsing.sumberDana.length > 0) && (
            <div className="mb-4" id="ditahan">
              <Peringatan nada="waspada" judul="R9: kode perlu dipetakan">
                {r.kodeAsing.subkegiatan.length > 0 && <p>Kode subkegiatan tidak ada di nomenklatur aktif: {r.kodeAsing.subkegiatan.join(', ')}</p>}
                {r.kodeAsing.sumberDana.length > 0 && <p>Kode sumber dana tidak ada di master: {r.kodeAsing.sumberDana.join(', ')}</p>}
                <p className="mt-1">Baris tersebut ditahan. Tambahkan kode ke master, lalu klik Proses ulang.</p>
              </Peringatan>
            </div>
          )}
          {((r.skpdBaru as string[])?.length > 0 || (r.subUnitBaru as string[])?.length > 0) && (
            <p className="mb-4 text-sm text-redup">
              Dibuat otomatis: {(r.skpdBaru as string[]).length} SKPD, {(r.subUnitBaru as string[]).length} sub unit.
            </p>
          )}
        </>
      )}
      {!berjalan && !apbd && b.status !== 'gagal' && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Statistik label="Jumlah" nilai={String(r.jumlah ?? 0)} sub={r.versi ? `versi ${r.versi}` : r.tahun ? `tahun ${r.tahun}` : undefined} />
          <Statistik label="Baru" nilai={String(r.baru ?? 0)} />
          {'berubahNama' in r && <Statistik label="Berubah nama" nilai={String(r.berubahNama ?? 0)} />}
          {'tidakAdaLagi' in r && <Statistik label="Tidak ada lagi di file" nilai={String(r.tidakAdaLagi ?? 0)} sub={b.jenis === 'nomenklatur' ? 'akan ditandai nonaktif' : 'tidak diubah'} />}
          {'ditahan' in r && <Statistik label="Ditahan" nilai={String(r.ditahan ?? 0)} nada={(r.ditahan as number) ? 'waspada' : undefined} />}
          {Array.isArray(r.belumDipetakan) && r.belumDipetakan.length > 0 && (
            <div className="col-span-full">
              <Peringatan nada="waspada" judul="Nama tagging belum dipetakan ke sumber dana">
                {(r.belumDipetakan as string[]).join(', ')}. Isi kolom &quot;nama tagging&quot; di Master Sumber Dana lalu proses ulang.
              </Peringatan>
            </div>
          )}
        </div>
      )}

      {!berjalan && (b.status === 'pratinjau' || b.status === 'diterapkan') && (
        <Kartu
          padat
          judul={
            <div className="flex flex-wrap gap-1" role="tablist">
              {(apbd ? (['hasil', 'ditahan'] as const) : (['baris', 'ditahan'] as const)).map((x) => (
                <button
                  key={x}
                  role="tab"
                  aria-selected={bagian === x}
                  onClick={() => {
                    setBagian(x);
                    setPage(1);
                    setAturan('');
                  }}
                  className={cx('rounded-md px-2.5 py-1 text-sm', bagian === x ? 'bg-utama-lembut font-medium text-utama' : 'text-redup hover:text-teks')}
                >
                  {x === 'hasil' ? 'Perubahan' : x === 'baris' ? 'Isi file' : 'Baris ditahan'}
                </button>
              ))}
            </div>
          }
          aksi={
            bagian === 'hasil' ? (
              <div className="flex flex-wrap gap-1">
                {['', ...ATURAN_FILTER].map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAturan(a);
                      setPage(1);
                    }}
                    className={cx('rounded-full border px-2 py-0.5 text-xs', aturan === a ? 'border-utama bg-utama-lembut text-utama' : 'border-garis text-redup')}
                    title={a ? LABEL_ATURAN[a] : undefined}
                  >
                    {a || 'Semua'}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          {!daftar ? (
            <p className="p-6 text-center text-sm text-redup">Memuat…</p>
          ) : daftar.data.length ? (
            <>
              {bagian === 'hasil' ? (
                <Tabel>
                  <thead>
                    <tr>
                      <TH>Aturan</TH>
                      <TH>Subkegiatan</TH>
                      <TH>SKPD</TH>
                      <TH kanan>Pagu sebelum</TH>
                      <TH kanan>Pagu sesudah</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {(daftar.data as { _id: string; aturan: string; kodeSubkegiatan: string; namaSubkegiatan: string; skpdId?: { nama: string }; sebelum?: { pagu: number } | null; sesudah?: { pagu: number } | null }[]).map((h) => (
                      <tr key={h._id}>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            {h.aturan.split(',').map((a) => (
                              <Lencana key={a} nada={a === 'R2' || a === 'R8' ? 'waspada' : a === 'R7' ? 'aman' : 'info'} title={LABEL_ATURAN[a]}>
                                {a}
                              </Lencana>
                            ))}
                          </div>
                        </TD>
                        <TD>
                          <span className="font-mono text-xs text-redup">{h.kodeSubkegiatan}</span>
                          <span className="block">{h.namaSubkegiatan}</span>
                        </TD>
                        <TD className="text-redup">{h.skpdId?.nama}</TD>
                        <TD kanan>{h.sebelum ? rp(h.sebelum.pagu) : '–'}</TD>
                        <TD kanan className={cx(h.sebelum && h.sesudah && h.sebelum.pagu !== h.sesudah.pagu && 'font-semibold')}>{h.sesudah ? rp(h.sesudah.pagu) : '–'}</TD>
                      </tr>
                    ))}
                  </tbody>
                </Tabel>
              ) : (
                <Tabel>
                  <thead>
                    <tr>
                      <TH kanan>Baris</TH>
                      <TH>Isi</TH>
                      <TH>{bagian === 'ditahan' ? 'Alasan' : 'Aksi'}</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {(daftar.data as { _id: string; noBaris: number; data: Record<string, unknown>; alasan?: string }[]).map((x) => (
                      <tr key={x._id}>
                        <TD kanan>{x.noBaris > 100000 ? '–' : x.noBaris}</TD>
                        <TD>
                          <span className="font-mono text-xs text-redup">{String(x.data.kode ?? x.data.kodeSubkegiatan ?? '')}</span>{' '}
                          {String(x.data.nama ?? x.data.namaSubkegiatan ?? x.data.namaTagging ?? x.data.teks ?? '')}
                          {typeof x.data.pagu === 'number' && <span className="angka ml-2 text-redup">{rp(x.data.pagu as number)}</span>}
                          {typeof x.data.namaLama === 'string' && x.data.aksi === 'berubah_nama' && <span className="block text-xs text-redup">sebelumnya: {String(x.data.namaLama)}</span>}
                        </TD>
                        <TD className={bagian === 'ditahan' ? 'text-waspada' : 'text-redup'}>{x.alasan ?? String(x.data.aksi ?? '')}</TD>
                      </tr>
                    ))}
                  </tbody>
                </Tabel>
              )}
              {daftar.total > daftar.limit && (
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-xs text-redup">
                    {(page - 1) * daftar.limit + 1}–{Math.min(page * daftar.limit, daftar.total)} dari {daftar.total}
                  </span>
                  <div className="flex gap-1.5">
                    <Tombol kecil disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Sebelumnya
                    </Tombol>
                    <Tombol kecil disabled={page * daftar.limit >= daftar.total} onClick={() => setPage((p) => p + 1)}>
                      Berikutnya
                    </Tombol>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Kosong judul={bagian === 'ditahan' ? 'Tidak ada baris ditahan' : 'Tidak ada perubahan'} />
          )}
        </Kartu>
      )}
    </>
  );
}
