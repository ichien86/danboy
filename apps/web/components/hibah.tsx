'use client';

import { FileText, Search, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LABEL_STATUS_USULAN, type StatusUsulan } from '@danboy/core/hibah';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Lencana, Masukan, Peringatan, Pilihan, Tabel, TD, TH, Tombol, cx } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

/* ---------- Status ---------- */

const NADA_STATUS: Record<StatusUsulan, 'netral' | 'info' | 'aman' | 'waspada' | 'bahaya' | 'utama'> = {
  draf: 'netral',
  evaluasi: 'info',
  layak: 'utama',
  tidak_layak: 'bahaya',
  dalam_rekomendasi: 'info',
  rekomendasi_diunggah: 'waspada',
  perbaikan: 'waspada',
  disetujui: 'aman',
  ditolak: 'bahaya',
};
export function LencanaStatus({ status }: { status: StatusUsulan }) {
  return <Lencana nada={NADA_STATUS[status]}>{LABEL_STATUS_USULAN[status]}</Lencana>;
}

/* ---------- Aksi sederhana ---------- */

/** Tombol yang memanggil API, menampilkan toast, lalu memuat ulang data halaman. */
export function TombolAksi({
  url, method = 'POST', body, label, konfirmasi, varian = 'biasa', kecil = true, berhasil = 'Tersimpan', ke, disabled, title,
}: {
  url: string; method?: string; body?: unknown; label: ReactNode; konfirmasi?: string; varian?: 'utama' | 'biasa' | 'hantu' | 'bahaya'; kecil?: boolean;
  berhasil?: string; ke?: string; disabled?: boolean; title?: string;
}) {
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <Tombol
      kecil={kecil}
      varian={varian}
      memuat={memuat}
      disabled={disabled}
      title={title}
      onClick={async () => {
        if (konfirmasi && !confirm(konfirmasi)) return;
        setMemuat(true);
        try {
          await api(url, { method, body: body ?? {} });
          toast(berhasil);
          if (ke) router.push(ke);
          router.refresh();
        } catch (e) {
          toast(pesanGalat(e), 'bahaya');
        } finally {
          setMemuat(false);
        }
      }}
    >
      {label}
    </Tombol>
  );
}

/** Unggah satu berkas (multipart) dengan field tambahan; maks. 5 MB untuk PDF/JPG/PNG kecuali `accept` lain. */
export function UnggahBerkas({
  url, field = 'file', data = {}, label = 'Unggah', accept = '.pdf,.jpg,.jpeg,.png', berhasil = 'Berkas diunggah', kecil = true, varian = 'biasa', onHasil,
}: {
  url: string; field?: string; data?: Record<string, string>; label?: ReactNode; accept?: string; berhasil?: string; kecil?: boolean;
  varian?: 'utama' | 'biasa' | 'hantu'; onHasil?: (r: unknown) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const fd = new FormData();
          fd.set(field, f);
          for (const [k, v] of Object.entries(data)) fd.set(k, v);
          setMemuat(true);
          try {
            const r = await api(url, { form: fd });
            toast(berhasil);
            onHasil?.(r);
            router.refresh();
          } catch (err) {
            toast(pesanGalat(err), 'bahaya');
          } finally {
            setMemuat(false);
          }
        }}
      />
      <Tombol kecil={kecil} varian={varian} memuat={memuat} onClick={() => ref.current?.click()}>
        <Upload className="size-3.5" aria-hidden /> {label}
      </Tombol>
    </>
  );
}

/* ---------- Tabel master generik ---------- */

export interface KolomMaster {
  key: string;
  label: string;
  tipe?: 'teks' | 'angka' | 'bool' | 'pilihan' | 'multi';
  opsi?: { nilai: string; label: string }[];
  wajib?: boolean;
  /** tampil di tabel (bawaan ya) */
  tabel?: boolean;
  bawaan?: unknown;
  bantuan?: string;
  kunci?: boolean;
}

function nilaiAwal(k: KolomMaster, baris?: Record<string, unknown>) {
  const v = baris?.[k.key] ?? k.bawaan;
  if (k.tipe === 'bool') return v === undefined ? true : !!v;
  if (k.tipe === 'multi') return Array.isArray(v) ? v : [];
  return v === undefined || v === null ? '' : v;
}

function FormMaster({ jenis, kolom, baris, onTutup }: { jenis: string; kolom: KolomMaster[]; baris?: Record<string, unknown>; onTutup: () => void }) {
  const [isi, setIsi] = useState<Record<string, unknown>>(() => Object.fromEntries(kolom.map((k) => [k.key, nilaiAwal(k, baris)])));
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMemuat(true);
        setGalat({});
        setUmum('');
        const body = Object.fromEntries(kolom.map((k) => [k.key, k.tipe === 'angka' ? Number(isi[k.key] || 0) : isi[k.key]]));
        try {
          await api(baris ? `/api/hibah/master/${jenis}/${baris._id}` : `/api/hibah/master/${jenis}`, { method: baris ? 'PATCH' : 'POST', body });
          toast('Tersimpan');
          router.refresh();
          onTutup();
        } catch (err) {
          if (err instanceof GalatApi && err.detail) setGalat(err.detail);
          setUmum(pesanGalat(err));
        } finally {
          setMemuat(false);
        }
      }}
    >
      {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
      {kolom.map((k) => {
        const id = `m-${k.key}`;
        const ubah = (v: unknown) => setIsi((s) => ({ ...s, [k.key]: v }));
        if (k.tipe === 'bool')
          return (
            <label key={k.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!isi[k.key]} onChange={(e) => ubah(e.target.checked)} /> {k.label}
            </label>
          );
        return (
          <Bidang key={k.key} label={k.label} htmlFor={id} galat={galat[k.key]} bantuan={k.bantuan}>
            {k.tipe === 'pilihan' ? (
              <Pilihan id={id} value={String(isi[k.key] ?? '')} onChange={(e) => ubah(e.target.value)} required={k.wajib} disabled={k.kunci && !!baris}>
                <option value="">Pilih…</option>
                {k.opsi?.map((o) => (
                  <option key={o.nilai} value={o.nilai}>
                    {o.label}
                  </option>
                ))}
              </Pilihan>
            ) : k.tipe === 'multi' ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {k.opsi?.map((o) => {
                  const arr = (isi[k.key] as string[]) ?? [];
                  return (
                    <label key={o.nilai} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={arr.includes(o.nilai)} onChange={(e) => ubah(e.target.checked ? [...arr, o.nilai] : arr.filter((x) => x !== o.nilai))} />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            ) : (
              <Masukan
                id={id}
                type={k.tipe === 'angka' ? 'number' : 'text'}
                value={String(isi[k.key] ?? '')}
                onChange={(e) => ubah(e.target.value)}
                required={k.wajib}
                disabled={k.kunci && !!baris}
              />
            )}
          </Bidang>
        );
      })}
      <div className="flex justify-end gap-2">
        <Tombol type="button" onClick={onTutup}>
          Batal
        </Tombol>
        <Tombol type="submit" varian="utama" memuat={memuat}>
          Simpan
        </Tombol>
      </div>
    </form>
  );
}

function tampilNilai(k: KolomMaster, v: unknown): ReactNode {
  if (k.tipe === 'bool') return v ? 'Ya' : <span className="text-redup">Tidak</span>;
  if (k.tipe === 'pilihan') return k.opsi?.find((o) => o.nilai === v)?.label ?? String(v ?? '');
  if (k.tipe === 'multi') return (v as string[] | undefined)?.length ? (v as string[]).map((x) => k.opsi?.find((o) => o.nilai === x)?.label ?? x).join(', ') : <span className="text-redup">–</span>;
  return String(v ?? '');
}

/** Daftar master dengan tambah/ubah lewat modal; validasi di server (skema Zod per jenis). */
export function TabelMaster({ jenis, judul, kolom, data, bisaUbah = true }: { jenis: string; judul: string; kolom: KolomMaster[]; data: Record<string, unknown>[]; bisaUbah?: boolean }) {
  const [buka, setBuka] = useState<Record<string, unknown> | 'baru' | null>(null);
  const [q, setQ] = useState('');
  const tampil = kolom.filter((k) => k.tabel !== false);
  const saring = q.trim()
    ? data.filter((d) => kolom.some((k) => String(d[k.key] ?? '').toLowerCase().includes(q.trim().toLowerCase())))
    : data;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-garis px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-redup" aria-hidden />
          <Masukan data-cari value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari ${judul.toLowerCase()}…`} className="h-9 w-64 pl-8" aria-label={`Cari ${judul}`} />
        </div>
        <span className="text-xs text-redup">{saring.length} butir</span>
        {bisaUbah && (
          <Tombol varian="utama" kecil className="ml-auto" onClick={() => setBuka('baru')}>
            Tambah
          </Tombol>
        )}
      </div>
      <Tabel>
        <thead>
          <tr>
            {tampil.map((k) => (
              <TH key={k.key}>{k.label}</TH>
            ))}
            {bisaUbah && <TH />}
          </tr>
        </thead>
        <tbody>
          {saring.map((d) => (
            <tr key={String(d._id)} className={d.aktif === false ? 'opacity-60' : ''}>
              {tampil.map((k) => (
                <TD key={k.key} className={k.key === 'kode' || k.key === 'kodeRekening' ? 'whitespace-nowrap font-mono text-xs' : ''}>
                  {tampilNilai(k, d[k.key])}
                </TD>
              ))}
              {bisaUbah && (
                <TD>
                  <Tombol kecil varian="hantu" onClick={() => setBuka(d)}>
                    Ubah
                  </Tombol>
                </TD>
              )}
            </tr>
          ))}
          {!saring.length && (
            <tr>
              <TD colSpan={tampil.length + 1} className="py-8 text-center text-redup">
                Belum ada data
              </TD>
            </tr>
          )}
        </tbody>
      </Tabel>
      <Modal buka={!!buka} setBuka={(b) => !b && setBuka(null)} judul={buka === 'baru' ? `Tambah ${judul.toLowerCase()}` : `Ubah ${judul.toLowerCase()}`}>
        {buka && <FormMaster jenis={jenis} kolom={kolom} baris={buka === 'baru' ? undefined : buka} onTutup={() => setBuka(null)} />}
      </Modal>
    </div>
  );
}

/* ---------- Pencarian cepat modul ---------- */

interface HasilCariHibah {
  jenis: 'usulan' | 'rekomendasi';
  id: string;
  judul: string;
  sub: string;
}

/** Ctrl+K di modul Hibah dan Bansos: calon penerima, nomor usulan, nomor rekomendasi. */
export function PencarianHibah({ aktif }: { aktif: boolean }) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState('');
  const [hasil, setHasil] = useState<HasilCariHibah[]>([]);
  const [pilih, setPilih] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuka((b) => !b);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (!aktif || q.trim().length < 2) return setHasil([]);
    const t = setTimeout(() => {
      api<HasilCariHibah[]>(`/api/hibah/cari?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setHasil(r);
          setPilih(0);
        })
        .catch(() => setHasil([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, aktif]);
  const ke = (h: HasilCariHibah) => {
    setBuka(false);
    setQ('');
    router.push(`/hibah-bansos/${h.jenis === 'usulan' ? 'usulan' : 'rekomendasi'}/${h.id}`);
  };
  if (!aktif) return null;
  return (
    <>
      <button type="button" onClick={() => setBuka(true)} className="flex h-8 items-center gap-2 rounded-md border border-garis bg-permukaan px-2.5 text-sm text-redup hover:text-teks">
        <Search className="size-3.5" aria-hidden />
        <span className="hidden md:inline">Cari penerima atau nomor</span>
        <kbd className="hidden rounded border border-garis px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
      </button>
      <Modal buka={buka} setBuka={setBuka} judul="Cari usulan" deskripsi="Ketik nama penerima, nomor usulan (HB-2027-…), atau nomor rekomendasi">
        <Masukan
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nama atau nomor…"
          aria-label="Kata kunci pencarian"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setPilih((p) => Math.min(p + 1, hasil.length - 1));
            if (e.key === 'ArrowUp') setPilih((p) => Math.max(p - 1, 0));
            if (e.key === 'Enter' && hasil[pilih]) ke(hasil[pilih]);
          }}
        />
        <ul className="mt-3 divide-y divide-garis" role="listbox">
          {hasil.map((h, i) => (
            <li key={`${h.jenis}-${h.id}`} role="option" aria-selected={i === pilih}>
              <button type="button" onClick={() => ke(h)} className={cx('flex w-full items-start gap-2 rounded px-2 py-2 text-left', i === pilih ? 'bg-utama-lembut' : 'hover:bg-latar')}>
                <FileText className="mt-0.5 size-4 shrink-0 text-redup" aria-hidden />
                <span>
                  <span className="block text-sm">{h.judul}</span>
                  <span className="block text-xs text-redup">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !hasil.length && <li className="py-6 text-center text-sm text-redup">Tidak ada hasil</li>}
        </ul>
      </Modal>
    </>
  );
}
