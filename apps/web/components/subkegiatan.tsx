'use client';

import { Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, bacaAngka, pesanGalat, rp, tulisAngka, GalatApi } from '@/lib/klien';
import { LABEL_ATURAN, LencanaTagging, StatusSumberDana, tanggal } from './domain';
import { Modal, useToast } from './klien';
import { cx, Kosong, Lencana, Peringatan, Pilihan, Tabel, TD, TH, Tombol } from './ui';

interface SD {
  _id: string;
  kode: string;
  nama: string;
  khusus?: boolean;
}
interface Alokasi {
  sumberDanaId: string;
  nilai: number;
  nilaiSipd: number;
  asal: 'sipd' | 'admin';
}
interface Detail {
  _id: string;
  tahapanId: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  status: string;
  seimbang: boolean;
  updatedAt: string;
  alokasi: Alokasi[];
  alokasiSipd: { sumberDanaId: string; nilai: number }[];
  beda: { ada: boolean; diputuskan?: string; pada?: string };
  rincian: { kodeRekening: string; kodeSumberDana: string; paket?: string; namaPaket?: string; pagu: number }[];
  tahapan: { _id: string; nama: string; status: string; tahun: number };
  skpd?: { nama: string; kode: string };
  subUnit?: { nama: string; kode: string };
  sumberDana: Record<string, SD>;
  tagging: { _id: string; kategori: string; rincian: string; sumberDanaId: SD }[];
  taggingSd: string[];
  r6: string[];
  nomenklatur?: { nama: string };
  riwayat: { _id: string; aksi: string; waktu: string; userId?: { nama: string }; sebelum?: Record<string, unknown>; sesudah?: Record<string, unknown> }[];
  riwayatImpor: { _id: string; aturan: string; batchId: { namaFile: string; diterapkanPada: string }; sebelum?: { pagu: number }; sesudah?: { pagu: number } }[];
}
interface BarisRekap {
  sumberDanaId: string;
  pagu: number | null;
  terpakai: number;
}

const jumlah = (xs: { nilai: number }[]) => xs.reduce((a, b) => a + (b.nilai || 0), 0);

/** Dua kolom tersimpan vs SIPD, sel yang berbeda disorot. */
export function BandingSipd({ d }: { d: Detail }) {
  const ids = [...new Set([...d.alokasi.map((a) => a.sumberDanaId), ...d.alokasiSipd.map((a) => a.sumberDanaId)])];
  const tersimpan = new Map(d.alokasi.map((a) => [a.sumberDanaId, a]));
  const sipd = new Map(d.alokasiSipd.map((a) => [a.sumberDanaId, a.nilai]));
  return (
    <Tabel>
      <thead>
        <tr>
          <TH>Sumber dana</TH>
          <TH kanan>Tersimpan</TH>
          <TH kanan>SIPD</TH>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const t = tersimpan.get(id)?.nilai ?? 0;
          const s = sipd.get(id) ?? 0;
          const beda = t !== s;
          return (
            <tr key={id}>
              <TD>
                {d.sumberDana[id]?.nama ?? id}
                {tersimpan.get(id)?.asal === 'admin' && (
                  <Lencana nada="utama" className="ml-1.5">
                    diubah Admin
                  </Lencana>
                )}
              </TD>
              <TD kanan className={cx(beda && 'bg-waspada-lembut font-semibold')}>{rp(t)}</TD>
              <TD kanan className={cx(beda && 'bg-waspada-lembut font-semibold')}>{rp(s)}</TD>
            </tr>
          );
        })}
        <tr className="font-semibold">
          <TD>Jumlah</TD>
          <TD kanan>{rp(jumlah(d.alokasi))}</TD>
          <TD kanan>{rp(jumlah(d.alokasiSipd))}</TD>
        </tr>
      </tbody>
    </Tabel>
  );
}

/** Baris sumber dana + nilai; sisa pagu tiap sumber dana dihitung sambil mengetik. */
export function PanelAlokasi({ d, bolehUbah, onTersimpan }: { d: Detail; bolehUbah: boolean; onTersimpan: () => void }) {
  const toast = useToast();
  const [baris, setBaris] = useState(d.alokasi.map((a) => ({ sumberDanaId: a.sumberDanaId, teks: tulisAngka(a.nilai) })));
  const [semuaSd, setSemuaSd] = useState<SD[]>([]);
  const [rekap, setRekap] = useState<Map<string, BarisRekap>>(new Map());
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const terbuka = d.tahapan.status === 'terbuka';
  const ubah = bolehUbah && terbuka;

  useEffect(() => {
    setBaris(d.alokasi.map((a) => ({ sumberDanaId: a.sumberDanaId, teks: tulisAngka(a.nilai) })));
  }, [d]);
  useEffect(() => {
    if (!ubah) return;
    api<SD[]>('/api/sumber-dana').then((x) => setSemuaSd(x.filter((s) => (s as SD & { aktif?: boolean }).aktif !== false))).catch(() => {});
    api<{ baris: BarisRekap[] }>(`/api/tahapan/${d.tahapanId}/rekap-sumber-dana`)
      .then((r) => setRekap(new Map(r.baris.map((b) => [b.sumberDanaId, b]))))
      .catch(() => {});
  }, [ubah, d.tahapanId]);

  const nilai = baris.map((b) => ({ sumberDanaId: b.sumberDanaId, nilai: bacaAngka(b.teks) ?? 0 }));
  const total = jumlah(nilai);
  const selisih = d.pagu - total;
  const lama = new Map(d.alokasi.map((a) => [a.sumberDanaId, a.nilai]));
  const ganda = new Set(baris.map((b) => b.sumberDanaId)).size !== baris.length;
  const sdNama = (id: string) => semuaSd.find((s) => s._id === id)?.nama ?? d.sumberDana[id]?.nama ?? id;

  const sisaSetelah = (id: string) => {
    const r = rekap.get(id);
    if (!r || r.pagu === null) return null;
    const baru = nilai.filter((x) => x.sumberDanaId === id).reduce((a, b) => a + b.nilai, 0);
    return r.pagu - (r.terpakai - (lama.get(id) ?? 0) + baru);
  };

  const simpan = async () => {
    setGalat('');
    if (ganda) return setGalat('Sumber dana tidak boleh ganda');
    if (baris.some((b) => !b.sumberDanaId)) return setGalat('Pilih sumber dana di setiap baris');
    setMemuat(true);
    try {
      const r = await api<{ peringatan: { sumberDana: string; lebih: number }[] }>(`/api/subkegiatan/${d._id}/alokasi`, {
        method: 'PUT',
        body: { updatedAt: d.updatedAt, alokasi: nilai },
      });
      toast('Alokasi disimpan');
      for (const p of r.peringatan) toast(`Pagu ${p.sumberDana} terlampaui ${rp(p.lebih)}`, 'waspada');
      onTersimpan();
    } catch (e) {
      setGalat(pesanGalat(e));
      if (e instanceof GalatApi && e.kode === 'DATA_BERUBAH') onTersimpan();
    } finally {
      setMemuat(false);
    }
  };

  if (!ubah) {
    return (
      <div className="space-y-3">
        {bolehUbah && !terbuka && <Peringatan nada="waspada">Tahapan {d.tahapan.nama} tidak terbuka; alokasi tidak bisa diubah.</Peringatan>}
        <Tabel>
          <thead>
            <tr>
              <TH>Sumber dana</TH>
              <TH kanan>Nilai</TH>
            </tr>
          </thead>
          <tbody>
            {d.alokasi.map((a) => (
              <tr key={a.sumberDanaId}>
                <TD>{d.sumberDana[a.sumberDanaId]?.nama ?? a.sumberDanaId}</TD>
                <TD kanan>{rp(a.nilai)}</TD>
              </tr>
            ))}
            <tr className="font-semibold">
              <TD>Jumlah</TD>
              <TD kanan>{rp(total)}</TD>
            </tr>
          </tbody>
        </Tabel>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
      <div className="space-y-2">
        {baris.map((b, i) => {
          const sisa = b.sumberDanaId ? sisaSetelah(b.sumberDanaId) : null;
          return (
            <div key={i} className="rounded-md border border-garis p-2.5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Pilihan
                  aria-label={`Sumber dana baris ${i + 1}`}
                  value={b.sumberDanaId}
                  onChange={(e) => setBaris((x) => x.map((y, j) => (j === i ? { ...y, sumberDanaId: e.target.value } : y)))}
                  className="sm:flex-1"
                >
                  <option value="">Pilih sumber dana…</option>
                  {!semuaSd.some((s) => s._id === b.sumberDanaId) && b.sumberDanaId && <option value={b.sumberDanaId}>{sdNama(b.sumberDanaId)}</option>}
                  {semuaSd.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.kode} — {s.nama}
                    </option>
                  ))}
                </Pilihan>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    aria-label={`Nilai baris ${i + 1}`}
                    value={b.teks}
                    onChange={(e) => setBaris((x) => x.map((y, j) => (j === i ? { ...y, teks: tulisAngka(bacaAngka(e.target.value)) } : y)))}
                    className="angka h-9 w-full rounded-md border border-garis bg-permukaan px-3 text-right text-sm sm:w-48"
                    placeholder="0"
                  />
                  <Tombol type="button" varian="hantu" onClick={() => setBaris((x) => x.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>
                    <Trash2 className="size-4" />
                  </Tombol>
                </div>
              </div>
              {b.sumberDanaId && (
                <p className={cx('mt-1.5 text-xs', sisa !== null && sisa < 0 ? 'text-bahaya' : 'text-redup')}>
                  {sisa === null ? 'Pagu sumber dana belum diisi' : sisa < 0 ? `Melebihi pagu sumber dana ${rp(-sisa)} setelah disimpan` : `Sisa pagu sumber dana setelah disimpan: ${rp(sisa)}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Tombol type="button" kecil onClick={() => setBaris((x) => [...x, { sumberDanaId: '', teks: '' }])}>
        <Plus className="size-3.5" /> Tambah sumber dana
      </Tombol>
      <div className="rounded-md bg-latar px-3 py-2.5 text-sm">
        <div className="flex justify-between">
          <span>Pagu subkegiatan</span>
          <span className="angka">{rp(d.pagu)}</span>
        </div>
        <div className="flex justify-between">
          <span>Jumlah alokasi</span>
          <span className="angka">{rp(total)}</span>
        </div>
        <div className={cx('flex justify-between font-semibold', selisih === 0 ? 'text-aman' : 'text-waspada')}>
          <span>{selisih === 0 ? 'Seimbang' : selisih > 0 ? 'Belum teralokasi' : 'Kelebihan alokasi'}</span>
          <span className="angka">{rp(Math.abs(selisih))}</span>
        </div>
      </div>
      <p className="text-xs text-redup">Penyimpanan tidak ditolak bila pagu sumber dana terlampaui; Anda akan mendapat peringatan.</p>
      <div className="flex justify-end gap-2">
        <Tombol type="button" onClick={() => setBaris(d.alokasi.map((a) => ({ sumberDanaId: a.sumberDanaId, teks: tulisAngka(a.nilai) })))}>
          Batal
        </Tombol>
        <Tombol type="button" varian="utama" memuat={memuat} onClick={simpan}>
          Simpan alokasi
        </Tombol>
      </div>
    </div>
  );
}

const TAB = ['alokasi', 'sipd', 'rincian', 'tagging', 'riwayat'] as const;
const LABEL_TAB = { alokasi: 'Alokasi', sipd: 'Banding SIPD', rincian: 'Rincian rekening', tagging: 'Tagging', riwayat: 'Riwayat' };

export function DetailSubkegiatan({ id, bolehUbah, onBerubah }: { id: string; bolehUbah: boolean; onBerubah?: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [galat, setGalat] = useState('');
  const [tab, setTab] = useState<(typeof TAB)[number]>('alokasi');
  const [memuatSipd, setMemuatSipd] = useState(false);
  const toast = useToast();
  const muat = useCallback(() => {
    api<Detail>(`/api/subkegiatan/${id}`)
      .then((x) => {
        setD(x);
        setGalat('');
      })
      .catch((e) => setGalat(pesanGalat(e)));
  }, [id]);
  useEffect(() => {
    setD(null);
    muat();
  }, [muat]);

  if (galat) return <Peringatan nada="bahaya">{galat}</Peringatan>;
  if (!d) return <p className="py-10 text-center text-sm text-redup">Memuat…</p>;

  const sesudahUbah = () => {
    muat();
    onBerubah?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-redup">{d.kodeSubkegiatan}</p>
        <p className="font-medium">{d.namaSubkegiatan || d.nomenklatur?.nama}</p>
        <p className="text-sm text-redup">
          {d.skpd?.nama}
          {d.subUnit && d.subUnit.nama !== d.skpd?.nama ? ` › ${d.subUnit.nama}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Lencana nada={d.seimbang ? 'aman' : 'waspada'}>{d.seimbang ? 'Seimbang' : 'Belum seimbang (R4)'}</Lencana>
          {d.beda.ada && <Lencana nada="waspada">Berbeda dengan SIPD (R2)</Lencana>}
          {d.status === 'tidak_ada_di_impor' && <Lencana nada="bahaya">Tidak ada di impor terakhir (R8)</Lencana>}
          {d.tagging.map((t) => (
            <LencanaTagging key={t._id} nama={t.sumberDanaId?.nama} kategori={t.kategori} rincian={t.rincian} />
          ))}
          {d.r6.map((n) => (
            <Lencana key={n} nada="netral" title="R6: subkegiatan tertagging tetapi didanai sumber lain">
              Tertagging {n}, didanai sumber lain
            </Lencana>
          ))}
        </div>
      </div>

      {d.beda.ada && bolehUbah && d.tahapan.status === 'terbuka' && (
        <Peringatan nada="waspada" judul="Komposisi sumber dana berbeda dengan SIPD">
          <p>Pilih Ikut SIPD untuk menyalin komposisi SIPD, atau ubah alokasi lalu simpan (Edit Sendiri).</p>
          <Tombol
            kecil
            varian="utama"
            className="mt-2"
            memuat={memuatSipd}
            onClick={async () => {
              setMemuatSipd(true);
              try {
                await api(`/api/subkegiatan/${d._id}/ikut-sipd`, { method: 'POST' });
                toast('Alokasi mengikuti SIPD');
                sesudahUbah();
              } catch (e) {
                toast(pesanGalat(e), 'bahaya');
              } finally {
                setMemuatSipd(false);
              }
            }}
          >
            Ikut SIPD
          </Tombol>
        </Peringatan>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-garis" role="tablist">
        {TAB.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm', tab === t ? 'border-utama font-medium text-utama' : 'border-transparent text-redup hover:text-teks')}
          >
            {LABEL_TAB[t]}
          </button>
        ))}
      </div>

      {tab === 'alokasi' && <PanelAlokasi d={d} bolehUbah={bolehUbah} onTersimpan={sesudahUbah} />}
      {tab === 'sipd' && <BandingSipd d={d} />}
      {tab === 'rincian' && (
        <Tabel>
          <thead>
            <tr>
              <TH>Rekening</TH>
              <TH>Sumber dana</TH>
              <TH>Paket</TH>
              <TH kanan>Pagu</TH>
            </tr>
          </thead>
          <tbody>
            {d.rincian.map((r, i) => (
              <tr key={i}>
                <TD className="font-mono text-xs">{r.kodeRekening}</TD>
                <TD className="font-mono text-xs">{r.kodeSumberDana}</TD>
                <TD>{r.namaPaket || r.paket || '–'}</TD>
                <TD kanan>{rp(r.pagu)}</TD>
              </tr>
            ))}
            {!d.rincian.length && (
              <tr>
                <TD colSpan={4} className="py-6 text-center text-redup">
                  Belum ada rincian dari SIPD
                </TD>
              </tr>
            )}
          </tbody>
        </Tabel>
      )}
      {tab === 'tagging' &&
        (d.tagging.length ? (
          <ul className="space-y-2">
            {d.tagging.map((t) => (
              <li key={t._id} className="rounded-md border border-garis p-3 text-sm">
                <p className="font-medium">{t.sumberDanaId?.nama}</p>
                <p className="text-redup">{t.kategori}</p>
                {t.rincian && <p>{t.rincian}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Kosong judul="Tidak ada tagging">Subkegiatan ini tidak ada di daftar tagging tahun {d.tahapan.tahun}.</Kosong>
        ))}
      {tab === 'riwayat' && (
        <ul className="space-y-2 text-sm">
          {d.riwayatImpor.map((r) => (
            <li key={r._id} className="rounded-md border border-garis p-3">
              <p>
                Impor <span className="font-medium">{r.batchId.namaFile}</span> · {tanggal(r.batchId.diterapkanPada, true)}
              </p>
              <p className="text-redup">{r.aturan.split(',').map((a) => LABEL_ATURAN[a] ?? a).join(', ')}</p>
              {r.sebelum?.pagu !== undefined && r.sesudah?.pagu !== undefined && r.sebelum.pagu !== r.sesudah.pagu && (
                <p className="angka">
                  Pagu {rp(r.sebelum.pagu)} → {rp(r.sesudah.pagu)}
                </p>
              )}
            </li>
          ))}
          {d.riwayat.map((r) => (
            <li key={r._id} className="rounded-md border border-garis p-3">
              <p>
                <span className="font-medium">{r.userId?.nama ?? 'Sistem'}</span> · {r.aksi} · {tanggal(r.waktu, true)}
              </p>
              {r.sesudah && 'alokasi' in r.sesudah && <p className="text-redup">Alokasi diubah</p>}
            </li>
          ))}
          {!d.riwayat.length && !d.riwayatImpor.length && <Kosong judul="Belum ada riwayat" />}
        </ul>
      )}
    </div>
  );
}

/** Drawer detail yang dibuka lewat ?id= di URL, agar tautan bisa dibagikan. */
export function DrawerSubkegiatan({ bolehUbah }: { bolehUbah: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const id = sp.get('id');
  const tutup = () => {
    const q = new URLSearchParams(sp.toString());
    q.delete('id');
    router.replace(`${path}${q.size ? `?${q}` : ''}`, { scroll: false });
  };
  const judul = useMemo(() => 'Detail subkegiatan', []);
  return (
    <Modal buka={!!id} setBuka={(b) => !b && tutup()} judul={judul} samping>
      {id && <DetailSubkegiatan id={id} bolehUbah={bolehUbah} onBerubah={() => router.refresh()} />}
    </Modal>
  );
}

export { StatusSumberDana };
