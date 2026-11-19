'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Bell, Moon, Search, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/klien';
import { cx, Masukan } from './ui';
import { angka } from '@/lib/angka';

/* ---------- Dialog ---------- */

export function Modal({
  buka,
  setBuka,
  judul,
  deskripsi,
  children,
  lebar = 'max-w-lg',
  samping,
}: {
  buka: boolean;
  setBuka: (b: boolean) => void;
  judul: string;
  deskripsi?: string;
  children: ReactNode;
  lebar?: string;
  samping?: boolean;
}) {
  return (
    <Dialog.Root open={buka} onOpenChange={setBuka}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className={cx(
            'fixed z-50 flex flex-col border border-garis bg-permukaan shadow-xl focus:outline-none',
            samping
              ? 'inset-y-0 right-0 w-full max-w-3xl'
              : cx('left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg', lebar),
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-garis px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{judul}</Dialog.Title>
              {deskripsi ? (
                <Dialog.Description className="mt-0.5 text-sm text-redup">{deskripsi}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{judul}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded p-1 text-redup hover:bg-latar hover:text-teks" aria-label="Tutup">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Toast ---------- */

type Toast = { id: number; pesan: string; nada: 'aman' | 'bahaya' | 'waspada' | 'info' };
const KonteksToast = createContext<(pesan: string, nada?: Toast['nada']) => void>(() => {});
export const useToast = () => useContext(KonteksToast);

export function PenyediaToast({ children }: { children: ReactNode }) {
  const [daftar, setDaftar] = useState<Toast[]>([]);
  const n = useRef(0);
  const tampil = useCallback((pesan: string, nada: Toast['nada'] = 'aman') => {
    const id = ++n.current;
    setDaftar((d) => [...d, { id, pesan, nada }]);
    setTimeout(() => setDaftar((d) => d.filter((t) => t.id !== id)), nada === 'bahaya' ? 8000 : 4500);
  }, []);
  const warna = { aman: 'border-aman/40 bg-aman-lembut text-aman', bahaya: 'border-bahaya/40 bg-bahaya-lembut text-bahaya', waspada: 'border-waspada/40 bg-waspada-lembut text-waspada', info: 'border-info/40 bg-info-lembut text-info' };
  return (
    <KonteksToast.Provider value={tampil}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2" aria-live="polite">
        {daftar.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto rounded-md border px-3 py-2.5 text-sm shadow-lg', warna[t.nada])}>
            {t.pesan}
          </div>
        ))}
      </div>
    </KonteksToast.Provider>
  );
}

/* ---------- Tema ---------- */

export function TombolTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [siap, setSiap] = useState(false);
  useEffect(() => setSiap(true), []);
  const gelap = siap && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(gelap ? 'light' : 'dark')}
      className="rounded-md p-2 text-redup hover:bg-latar hover:text-teks"
      aria-label={gelap ? 'Mode terang' : 'Mode gelap'}
      title={gelap ? 'Mode terang' : 'Mode gelap'}
    >
      {gelap ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/* ---------- Pemilih tahapan ---------- */

export interface OpsiTahapan {
  _id: string;
  nama: string;
  tahun: number;
  status: string;
}

export function PemilihTahapan({ daftar, aktifId }: { daftar: OpsiTahapan[]; aktifId?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const aktif = daftar.find((t) => t._id === aktifId);
  const terbaruTerbuka = daftar.filter((t) => t.status === 'terbuka').sort((a, b) => b.tahun - a.tahun)[0]?._id;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="pilih-tahapan" className="sr-only">
        Tahapan
      </label>
      <select
        id="pilih-tahapan"
        value={aktifId ?? ''}
        onChange={(e) => {
          document.cookie = `danboy_tahapan=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          const q = new URLSearchParams(sp.toString());
          q.set('tahapan', e.target.value);
          q.delete('page');
          router.push(`${path}?${q}`);
          router.refresh();
        }}
        className="h-8 min-w-0 max-w-[14rem] rounded-md border border-garis bg-permukaan px-2 text-sm"
      >
        {!daftar.length && <option value="">Belum ada tahapan</option>}
        {daftar.map((t) => (
          <option key={t._id} value={t._id}>
            {t.nama}
            {t._id === terbaruTerbuka ? ' • terbaru' : ''}
            {t.status !== 'terbuka' ? ` (${t.status})` : ''}
          </option>
        ))}
      </select>
      {aktif && aktif.status !== 'terbuka' && (
        <span className="hidden whitespace-nowrap rounded bg-waspada-lembut px-2 py-0.5 text-xs font-medium text-waspada sm:inline">
          {aktif.status === 'ditutup' ? 'Tahapan ditutup' : 'Tahapan belum dibuka'}
        </span>
      )}
    </div>
  );
}

/* ---------- Penghitung notifikasi (polling 60 detik) ---------- */

export function LoncengNotifikasi({ tahapanId, awal }: { tahapanId?: string; awal: { total: number; kritis: number } }) {
  const [n, setN] = useState(awal);
  useEffect(() => {
    if (!tahapanId) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      api<{ total: number; kritis: number }>(`/api/notifikasi/hitung?tahapanId=${tahapanId}`).then(setN).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [tahapanId]);
  return (
    <Link href="/notifikasi" className="relative rounded-md p-2 text-redup hover:bg-latar hover:text-teks" aria-label={`Notifikasi, ${angka(n.total)} terbuka`}>
      <Bell className="size-4" />
      {n.total > 0 && (
        <span className={cx('angka absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 text-white', n.kritis ? 'bg-bahaya' : 'bg-waspada')}>
          {n.total > 99 ? '99+' : n.total}
        </span>
      )}
    </Link>
  );
}

/* ---------- Pencarian cepat Ctrl+K ---------- */

interface HasilCari {
  _id: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  skpdId?: { nama: string };
  subUnitId?: { nama: string };
}

export function PencarianCepat({ tahapanId }: { tahapanId?: string }) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState('');
  const [hasil, setHasil] = useState<HasilCari[]>([]);
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
    if (!tahapanId || q.trim().length < 2) return setHasil([]);
    const t = setTimeout(() => {
      api<{ data: HasilCari[] }>(`/api/tahapan/${tahapanId}/subkegiatan?limit=10&q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setHasil(r.data);
          setPilih(0);
        })
        .catch(() => setHasil([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tahapanId]);
  const ke = (h: HasilCari) => {
    setBuka(false);
    setQ('');
    router.push(`/subkegiatan?id=${h._id}`);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-garis bg-permukaan px-2.5 text-sm text-redup hover:text-teks"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="hidden md:inline">Cari subkegiatan</span>
        <kbd className="hidden rounded border border-garis px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
      </button>
      <Modal buka={buka} setBuka={setBuka} judul="Cari subkegiatan" deskripsi="Ketik kode (mis. 1.01.02) atau nama subkegiatan">
        <Masukan
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Kode atau nama…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setPilih((p) => Math.min(p + 1, hasil.length - 1));
            if (e.key === 'ArrowUp') setPilih((p) => Math.max(p - 1, 0));
            if (e.key === 'Enter' && hasil[pilih]) ke(hasil[pilih]);
          }}
          aria-label="Kata kunci pencarian"
        />
        <ul className="mt-3 divide-y divide-garis" role="listbox">
          {hasil.map((h, i) => (
            <li key={h._id} role="option" aria-selected={i === pilih}>
              <button type="button" onClick={() => ke(h)} className={cx('w-full rounded px-2 py-2 text-left', i === pilih ? 'bg-utama-lembut' : 'hover:bg-latar')}>
                <span className="font-mono text-xs text-redup">{h.kodeSubkegiatan}</span>
                <span className="block text-sm">{h.namaSubkegiatan}</span>
                <span className="block text-xs text-redup">{h.subUnitId?.nama ?? h.skpdId?.nama}</span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !hasil.length && <li className="py-6 text-center text-sm text-redup">Tidak ada hasil</li>}
        </ul>
      </Modal>
    </>
  );
}

/* ---------- Pintasan "/" untuk kotak cari halaman ---------- */

/**
 * Tekan "/" (saat tidak sedang mengetik) untuk langsung ke kotak cari di halaman (elemen ber-atribut data-cari).
 * Bila halaman tidak punya kotak cari, pencarian cepat subkegiatan (Ctrl+K) yang dibuka.
 */
export function PintasanCari() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      const kotak = document.querySelector<HTMLInputElement>('input[data-cari]');
      if (kotak) {
        kotak.focus();
        kotak.select();
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return null;
}

/* ---------- Navigasi aktif ---------- */

/** `tepat`: aktif hanya pada alamat itu sendiri (untuk dashboard modul yang menjadi awalan halaman lain). */
export function TautanNav({ href, children, ikon, tepat }: { href: string; children: ReactNode; ikon: ReactNode; tepat?: boolean }) {
  const path = usePathname();
  const aktif = path === href || (!tepat && path.startsWith(href + '/'));
  return (
    <Link
      href={href}
      aria-current={aktif ? 'page' : undefined}
      className={cx(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
        aktif ? 'bg-utama-lembut font-medium text-utama' : 'text-redup hover:bg-latar hover:text-teks',
      )}
    >
      <span className="shrink-0 [&>svg]:size-4" aria-hidden>
        {ikon}
      </span>
      {children}
    </Link>
  );
}
