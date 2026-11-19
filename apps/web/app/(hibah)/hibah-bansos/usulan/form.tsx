'use client';

import { Plus, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { hitungJumlah } from '@danboy/core/hibah';
import { Modal, useToast } from '@/components/klien';
import { AreaTeks, Bidang, Masukan, Peringatan, Pilihan, Tabel, TD, TH, Tombol } from '@/components/ui';
import { api, bacaAngka, GalatApi, pesanGalat, rp, tulisAngka } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Rincian { _id?: string; uraian: string; spesifikasi: string; volume: string; satuan: string; hargaSatuan: number | null }

const kosong = (): Rincian => ({ uraian: '', spesifikasi: '', volume: '1', satuan: '', hargaSatuan: null });
const vol = (s: string) => Number(String(s).replace(',', '.')) || 0;

/** Editor rincian aktivitas (FR-18, FR-19): jumlah per baris dihitung otomatis; bisa diisi dari templat Excel. */
function EditorRincian({ bentuk, rincian, setRincian }: { bentuk: string; rincian: Rincian[]; setRincian: (r: Rincian[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const barang = bentuk === 'barang';
  const total = rincian.reduce((a, r) => a + hitungJumlah({ volume: vol(r.volume), hargaSatuan: r.hargaSatuan ?? 0 }), 0);
  const ubah = (i: number, k: keyof Rincian, v: unknown) => setRincian(rincian.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Rincian aktivitas</p>
        <a href={`/api/hibah/impor/templat/rincian-${barang ? 'barang' : 'uang'}`} className="ml-auto text-xs text-utama hover:underline">
          Templat Excel
        </a>
        <input
          ref={ref}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const fd = new FormData();
            fd.set('file', f);
            fd.set('bentuk', bentuk);
            try {
              const r = await api<{ rincian: Data[] }>('/api/hibah/impor/rincian', { form: fd });
              if (rincian.some((x) => x.uraian) && !confirm(`Ganti ${rincian.length} rincian dengan ${r.rincian.length} baris dari berkas?`)) return;
              setRincian(r.rincian.map((x) => ({ uraian: x.uraian, spesifikasi: x.spesifikasi ?? '', volume: String(x.volume), satuan: x.satuan, hargaSatuan: x.hargaSatuan })));
              toast(`${r.rincian.length} rincian dibaca dari Excel`);
            } catch (err) {
              toast(pesanGalat(err), 'bahaya');
            }
          }}
        />
        <Tombol kecil type="button" onClick={() => ref.current?.click()}>
          <Upload className="size-3.5" aria-hidden /> Isi dari Excel
        </Tombol>
      </div>
      <div className="overflow-x-auto rounded-md border border-garis">
        <Tabel>
          <thead>
            <tr>
              <TH>{barang ? 'Nama barang' : 'Uraian aktivitas'}</TH>
              {barang && <TH>Spesifikasi</TH>}
              <TH>Volume</TH>
              <TH>Satuan</TH>
              <TH kanan>Harga satuan</TH>
              <TH kanan>Jumlah</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {rincian.map((r, i) => (
              <tr key={i}>
                <TD>
                  <Masukan value={r.uraian} onChange={(e) => ubah(i, 'uraian', e.target.value)} aria-label={`Uraian baris ${i + 1}`} className="min-w-48" />
                </TD>
                {barang && (
                  <TD>
                    <Masukan value={r.spesifikasi} onChange={(e) => ubah(i, 'spesifikasi', e.target.value)} aria-label={`Spesifikasi baris ${i + 1}`} className="min-w-36" />
                  </TD>
                )}
                <TD>
                  <Masukan value={r.volume} onChange={(e) => ubah(i, 'volume', e.target.value)} inputMode="decimal" className="w-20" aria-label={`Volume baris ${i + 1}`} />
                </TD>
                <TD>
                  <Masukan value={r.satuan} onChange={(e) => ubah(i, 'satuan', e.target.value)} className="w-24" aria-label={`Satuan baris ${i + 1}`} />
                </TD>
                <TD kanan>
                  <Masukan value={tulisAngka(r.hargaSatuan)} onChange={(e) => ubah(i, 'hargaSatuan', bacaAngka(e.target.value))} inputMode="numeric" className="w-32 text-right" aria-label={`Harga satuan baris ${i + 1}`} />
                </TD>
                <TD kanan className="whitespace-nowrap">
                  {rp(hitungJumlah({ volume: vol(r.volume), hargaSatuan: r.hargaSatuan ?? 0 }))}
                </TD>
                <TD>
                  <button type="button" onClick={() => setRincian(rincian.filter((_, n) => n !== i))} className="rounded p-1.5 text-redup hover:bg-latar hover:text-bahaya" aria-label={`Hapus baris ${i + 1}`}>
                    <Trash2 className="size-4" />
                  </button>
                </TD>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <TD colSpan={barang ? 5 : 4} className="font-medium">
                Nilai usulan
              </TD>
              <TD kanan className="whitespace-nowrap font-semibold">
                {rp(total)}
              </TD>
              <TD />
            </tr>
          </tfoot>
        </Tabel>
      </div>
      <Tombol kecil type="button" onClick={() => setRincian([...rincian, kosong()])}>
        <Plus className="size-3.5" aria-hidden /> Tambah baris
      </Tombol>
    </div>
  );
}

interface Props {
  opsi: { jenis: Data[]; tujuan: Data[]; rekening: Data[] };
  /** Usulan yang diubah; kosong = buat baru untuk `penerima`. */
  awal?: Data;
  penerima?: Data | null;
  tombol?: string;
  bukaAwal?: boolean;
}

export function FormUsulan({ opsi, awal, penerima, tombol, bukaAwal }: Props) {
  const [buka, setBuka] = useState(!!bukaAwal);
  const [pen, setPen] = useState<Data | null>(penerima ?? null);
  const [cariPen, setCariPen] = useState('');
  const [hasilPen, setHasilPen] = useState<Data[]>([]);
  const [isi, setIsi] = useState(() => ({
    bentuk: awal?.bentuk ?? 'uang',
    subkegiatanKode: awal?.subkegiatanKode ?? '',
    subkegiatanNama: awal?.subkegiatanNama ?? '',
    kodeRekening: awal?.kodeRekening ?? '',
    peruntukan: awal?.peruntukan ?? '',
    tujuanBansosKode: awal?.tujuanBansosKode ?? '',
    proposalNomor: awal?.proposal?.nomor ?? '',
    proposalTanggal: awal?.proposal?.tanggal ? String(awal.proposal.tanggal).slice(0, 10) : '',
  }));
  const [rincian, setRincian] = useState<Rincian[]>(() =>
    awal?.rincian?.length
      ? awal.rincian.map((r: Data) => ({ _id: r._id, uraian: r.uraian, spesifikasi: r.spesifikasi ?? '', volume: String(r.volume), satuan: r.satuan, hargaSatuan: r.hargaSatuan }))
      : [kosong()],
  );
  const [cariSub, setCariSub] = useState('');
  const [sub, setSub] = useState<{ sumber: string; data: Data[] }>({ sumber: '', data: [] });
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const kodeJenis = awal?.jenisPenerimaKode ?? pen?.jenisPenerimaKode;
  const jenis = opsi.jenis.find((j) => j.kode === kodeJenis);
  const rekening = opsi.rekening.filter((r) => (!r.jenisPenerimaKode?.length || r.jenisPenerimaKode.includes(kodeJenis)) && (jenis?.kelompok === 'bansos' ? r.kodeRekening.startsWith('5.1.06') : r.kodeRekening.startsWith('5.1.05')));

  useEffect(() => {
    if (!buka) return;
    const t = setTimeout(() => {
      api<{ sumber: string; data: Data[] }>(`/api/hibah/usulan/subkegiatan?q=${encodeURIComponent(cariSub)}`).then(setSub).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [cariSub, buka]);
  useEffect(() => {
    if (!buka || awal || cariPen.trim().length < 2) return setHasilPen([]);
    const t = setTimeout(() => {
      api<{ data: Data[] }>(`/api/hibah/penerima?limit=10&q=${encodeURIComponent(cariPen.trim())}`).then((r) => setHasilPen(r.data)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [cariPen, buka, awal]);
  useEffect(() => {
    // bentuk mengikuti yang diizinkan jenis penerima (BR-05)
    if (jenis && !jenis.bentuk.includes(isi.bentuk)) setIsi((s) => ({ ...s, bentuk: jenis.bentuk[0] }));
  }, [jenis, isi.bentuk]);

  const set = (k: string, v: string) => setIsi((s) => ({ ...s, [k]: v }));
  return (
    <>
      <Tombol varian={awal ? 'biasa' : 'utama'} onClick={() => setBuka(true)}>
        {tombol ?? (awal ? 'Ubah usulan' : 'Buat usulan')}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah usulan ${awal.nomor}` : 'Usulan baru'} lebar="max-w-5xl" samping>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!awal && !pen) return setUmum('Pilih calon penerima terlebih dahulu');
            setMemuat(true);
            setGalat({});
            setUmum('');
            const body: Data = {
              bentuk: isi.bentuk,
              subkegiatanKode: isi.subkegiatanKode,
              kodeRekening: isi.kodeRekening,
              peruntukan: isi.peruntukan,
              tujuanBansosKode: isi.tujuanBansosKode,
              proposalNomor: isi.proposalNomor,
              proposalTanggal: isi.proposalTanggal ? new Date(`${isi.proposalTanggal}T00:00:00+07:00`).toISOString() : null,
              rincian: rincian
                .filter((r) => r.uraian.trim())
                .map((r) => ({ ...(r._id ? { _id: r._id } : {}), uraian: r.uraian.trim(), spesifikasi: r.spesifikasi.trim(), volume: vol(r.volume), satuan: r.satuan.trim(), hargaSatuan: r.hargaSatuan ?? 0 })),
            };
            try {
              const r = awal
                ? await api<Data>(`/api/hibah/usulan/${awal._id}`, { method: 'PATCH', body: { ...body, updatedAt: awal.updatedAt } })
                : await api<Data>('/api/hibah/usulan', { body: { ...body, penerimaId: pen!._id } });
              toast(awal ? 'Usulan diperbarui' : `Usulan ${r.nomor} dibuat`);
              setBuka(false);
              if (!awal) router.push(`/hibah-bansos/usulan/${r._id}`);
              router.refresh();
            } catch (err) {
              if (err instanceof GalatApi && err.detail) setGalat(err.detail);
              setUmum(pesanGalat(err));
            } finally {
              setMemuat(false);
            }
          }}
        >
          {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
          {!awal && (
            <Bidang label="Calon penerima" htmlFor="u-pen">
              {pen ? (
                <div className="flex items-center gap-2 rounded-md border border-garis px-3 py-2 text-sm">
                  <span className="flex-1">
                    <strong>{pen.nama}</strong> <span className="text-redup">· {jenis?.nama} {pen.identitas?.samaran ? `· ${pen.identitas.samaran}` : ''}</span>
                  </span>
                  <Tombol kecil type="button" varian="hantu" onClick={() => setPen(null)}>
                    Ganti
                  </Tombol>
                </div>
              ) : (
                <>
                  <Masukan id="u-pen" value={cariPen} onChange={(e) => setCariPen(e.target.value)} placeholder="Ketik nama atau NIK lengkap…" />
                  <ul className="mt-1 divide-y divide-garis rounded-md border border-garis empty:hidden">
                    {hasilPen.map((p) => (
                      <li key={p._id}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-latar" onClick={() => setPen(p)}>
                          {p.nama} <span className="text-redup">{p.identitas?.samaran}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-redup">Belum ada kartunya? Tambahkan dulu di menu Calon Penerima.</p>
                </>
              )}
            </Bidang>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Bidang label="Bentuk" htmlFor="u-bentuk" galat={galat.bentuk}>
              <Pilihan id="u-bentuk" value={isi.bentuk} onChange={(e) => set('bentuk', e.target.value)}>
                {(jenis?.bentuk ?? ['uang', 'barang']).map((b: string) => (
                  <option key={b} value={b}>
                    {b === 'uang' ? 'Uang' : 'Barang'}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
            <Bidang label="Rekening" htmlFor="u-rek" galat={galat.kodeRekening}>
              <Pilihan id="u-rek" value={isi.kodeRekening} onChange={(e) => set('kodeRekening', e.target.value)}>
                <option value="">Pilih…</option>
                {rekening.map((r) => (
                  <option key={r.kodeRekening} value={r.kodeRekening}>
                    {r.kodeRekening} {r.nama}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
            <Bidang label={`Subkegiatan${sub.sumber ? ` (dari ${sub.sumber})` : ''}`} htmlFor="u-sub" galat={galat.subkegiatanKode}>
              <Masukan id="u-sub" value={cariSub} onChange={(e) => setCariSub(e.target.value)} placeholder="Cari kode atau nama subkegiatan…" />
              <Pilihan
                className="mt-1"
                aria-label="Pilih subkegiatan"
                value={isi.subkegiatanKode}
                onChange={(e) => setIsi((s) => ({ ...s, subkegiatanKode: e.target.value, subkegiatanNama: sub.data.find((x) => x.kode === e.target.value)?.nama ?? '' }))}
              >
                <option value="">{isi.subkegiatanKode ? `${isi.subkegiatanKode} ${isi.subkegiatanNama}` : 'Pilih…'}</option>
                {sub.data
                  .filter((x) => x.kode !== isi.subkegiatanKode)
                  .map((x) => (
                    <option key={x.kode} value={x.kode}>
                      {x.kode} {x.nama}
                    </option>
                  ))}
                {isi.subkegiatanKode && (
                  <option value={isi.subkegiatanKode}>
                    {isi.subkegiatanKode} {isi.subkegiatanNama}
                  </option>
                )}
              </Pilihan>
            </Bidang>
            {jenis?.kelompok === 'bansos' ? (
              <Bidang label="Tujuan bansos" htmlFor="u-tujuan" galat={galat.tujuanBansosKode}>
                <Pilihan id="u-tujuan" value={isi.tujuanBansosKode} onChange={(e) => set('tujuanBansosKode', e.target.value)}>
                  <option value="">Pilih…</option>
                  {opsi.tujuan.map((t) => (
                    <option key={t.kode} value={t.kode}>
                      {t.nama}
                    </option>
                  ))}
                </Pilihan>
              </Bidang>
            ) : (
              <Bidang label="Peruntukan hibah" htmlFor="u-untuk" galat={galat.peruntukan}>
                <AreaTeks id="u-untuk" rows={2} value={isi.peruntukan} onChange={(e) => set('peruntukan', e.target.value)} />
              </Bidang>
            )}
            <Bidang label="Nomor proposal" htmlFor="u-pno" galat={galat.proposalNomor}>
              <Masukan id="u-pno" value={isi.proposalNomor} onChange={(e) => set('proposalNomor', e.target.value)} />
            </Bidang>
            <Bidang label="Tanggal proposal" htmlFor="u-ptgl">
              <Masukan id="u-ptgl" type="date" value={isi.proposalTanggal} onChange={(e) => set('proposalTanggal', e.target.value)} />
            </Bidang>
          </div>
          <EditorRincian bentuk={isi.bentuk} rincian={rincian} setRincian={setRincian} />
          {galat.rincian && <p className="text-xs text-bahaya">{galat.rincian}</p>}
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama" memuat={memuat}>
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
