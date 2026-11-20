'use client';

import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  BookOpenText,
  Building2,
  CalendarRange,
  Check,
  ChevronsUpDown,
  ClipboardList,
  Database,
  FileSignature,
  FileText,
  Grid3x3,
  HardDrive,
  History,
  House,
  LayoutDashboard,
  ListTree,
  Lock,
  LogOut,
  MapPin,
  Menu,
  PieChart,
  ScrollText,
  Settings2,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PintasanCari, TautanNav } from '@/components/klien';
import { keluar } from '@/lib/aksi-keluar';
import type { GrupMenu, InfoModul, NamaIkon } from '@/lib/menu';

const IKON: Record<NamaIkon, ReactNode> = {
  dasbor: <LayoutDashboard />,
  rekap: <PieChart />,
  subkegiatan: <ClipboardList />,
  matriks: <Grid3x3 />,
  perbedaan: <ArrowLeftRight />,
  notifikasi: <Bell />,
  verifikasi: <BadgeCheck />,
  'sumber-dana': <Wallet />,
  rekening: <BookOpenText />,
  nomenklatur: <ListTree />,
  skpd: <Building2 />,
  tahapan: <Settings2 />,
  pengguna: <Users />,
  audit: <History />,
  timeline: <CalendarRange />,
  penerima: <UserRound />,
  usulan: <FileText />,
  rekomendasi: <FileSignature />,
  kunci: <Lock />,
  'berita-acara': <ScrollText />,
  progres: <TrendingUp />,
  master: <Database />,
  wilayah: <MapPin />,
  templat: <FileText />,
  riwayat: <History />,
  drive: <HardDrive />,
};

/** Keluar: hapus sesi lalu muat ulang ke halaman login. */
export function TombolKeluar() {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await keluar();
        } catch {
          /* tetap pindah ke login; middleware akan meminta login lagi bila sesi masih ada */
        }
        window.location.assign('/login');
      }}
    >
      <button type="submit" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-redup hover:bg-latar hover:text-teks">
        <LogOut className="size-4" aria-hidden />
        Keluar
      </button>
    </form>
  );
}

export interface PropsKerangka {
  modul: InfoModul['kode'];
  daftarModul: InfoModul[];
  menu: GrupMenu[];
  pengguna: { nama: string; peran: string };
}

/** Nama modul aktif; tombolnya membuka menu Beranda dan modul lain yang boleh diakses. */
function PemilihModul({ modul, daftarModul }: Pick<PropsKerangka, 'modul' | 'daftarModul'>) {
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const aktif = daftarModul.find((m) => m.kode === modul) ?? daftarModul[0];
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener('mousedown', tutup);
    document.addEventListener('keydown', tutup);
    return () => {
      document.removeEventListener('mousedown', tutup);
      document.removeEventListener('keydown', tutup);
    };
  }, [buka]);
  const isi = (
    <>
      <img src="/icon.svg" alt="" className="size-7 shrink-0" />
      <div className="min-w-0 flex-1 text-left leading-tight">
        <p className="truncate text-sm font-bold tracking-wide">{aktif?.nama}</p>
        <p className="truncate text-[11px] text-redup">{aktif?.sub}</p>
      </div>
    </>
  );
  return (
    <div ref={ref} className="relative border-b border-garis">
      <button
        type="button"
        onClick={() => setBuka((b) => !b)}
        aria-haspopup="menu"
        aria-expanded={buka}
        className="flex h-14 w-full items-center gap-2 px-4 hover:bg-latar"
      >
        {isi}
        <ChevronsUpDown className="size-4 shrink-0 text-redup" aria-hidden />
        <span className="sr-only">Beranda dan pilih modul</span>
      </button>
      {buka && (
        <div role="menu" className="absolute inset-x-2 top-full z-50 mt-1 rounded-md border border-garis bg-permukaan p-1 shadow-lg">
          <Link href="/" role="menuitem" onClick={() => setBuka(false)} className="flex items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-latar">
            <House className="size-4 text-redup" aria-hidden />
            <span className="font-medium">Beranda</span>
          </Link>
          <div className="my-1 border-t border-garis" />
          {daftarModul.map((m) => (
            <Link
              key={m.kode}
              href={m.href}
              role="menuitem"
              onClick={() => setBuka(false)}
              className="flex items-center gap-2 rounded px-2.5 py-2 text-sm hover:bg-latar"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{m.nama}</span>
                <span className="block text-xs text-redup">{m.sub}</span>
              </span>
              {m.kode === modul && <Check className="size-4 text-utama" aria-label="Modul aktif" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Navigasi({ modul, daftarModul, menu, pengguna }: PropsKerangka) {
  return (
    <div className="flex h-full flex-col">
      <PemilihModul modul={modul} daftarModul={daftarModul} />
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Menu utama">
        {menu.map((g, i) => (
          <div key={g.judul ?? i} className="space-y-0.5">
            {g.judul && <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-redup">{g.judul}</p>}
            {g.butir.map((b) => (
              <TautanNav key={b.href} href={b.href} ikon={IKON[b.ikon]} tepat={g.butir.some((x) => x !== b && x.href.startsWith(b.href + '/'))}>
                {b.label}
              </TautanNav>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-garis p-3">
        <p className="truncate text-sm font-medium">{pengguna.nama}</p>
        <p className="text-xs text-redup">{pengguna.peran}</p>
        <div className="mt-2">
          <TombolKeluar />
        </div>
      </div>
    </div>
  );
}

export function Kerangka({ bilah, children, ...nav }: PropsKerangka & { bilah: ReactNode; children: ReactNode }) {
  const [buka, setBuka] = useState(false);
  const path = usePathname();
  useEffect(() => setBuka(false), [path]);
  return (
    <div className="flex min-h-screen">
      <PintasanCari />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-garis bg-permukaan lg:block">
        <Navigasi {...nav} />
      </aside>
      {buka && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBuka(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 bg-permukaan shadow-xl">
            <button type="button" className="absolute right-2 top-3 z-10 rounded p-1.5 text-redup hover:bg-latar" onClick={() => setBuka(false)} aria-label="Tutup menu">
              <X className="size-4" />
            </button>
            <Navigasi {...nav} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-garis bg-permukaan/95 px-4 backdrop-blur">
          <button type="button" className="rounded-md p-2 text-redup hover:bg-latar lg:hidden" onClick={() => setBuka(true)} aria-label="Buka menu">
            <Menu className="size-4" />
          </button>
          {bilah}
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
