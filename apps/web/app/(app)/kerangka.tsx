'use client';

import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  BookOpenText,
  Grid3x3,
  History,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  PieChart,
  Settings2,
  Users,
  Wallet,
  Bell,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PintasanCari, TautanNav } from '@/components/klien';
import { keluar } from './aksi';

interface Menu {
  perbedaan: boolean;
  master: boolean;
  tahapan: boolean;
  pengguna: boolean;
  audit: boolean;
}

function Navigasi({ menu, pengguna }: { menu: Menu; pengguna: { nama: string; peran: string } }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-garis px-4">
        <img src="/icon.svg" alt="" className="size-7" />
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-wide">DANBOY</p>
          <p className="text-[11px] text-redup">Pemantauan Sumber Dana</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Menu utama">
        <div className="space-y-0.5">
          <TautanNav href="/dasbor" ikon={<LayoutDashboard />}>Dasbor</TautanNav>
          <TautanNav href="/rekap-sumber-dana" ikon={<PieChart />}>Rekap Sumber Dana</TautanNav>
          <TautanNav href="/subkegiatan" ikon={<ClipboardList />}>Subkegiatan</TautanNav>
          <TautanNav href="/matriks" ikon={<Grid3x3 />}>Matriks</TautanNav>
          {menu.perbedaan && <TautanNav href="/perbedaan" ikon={<ArrowLeftRight />}>Perbedaan SIPD</TautanNav>}
          <TautanNav href="/notifikasi" ikon={<Bell />}>Notifikasi</TautanNav>
          <TautanNav href="/verifikasi" ikon={<BadgeCheck />}>Verifikasi SIPD</TautanNav>
        </div>
        {menu.master && (
          <div className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-redup">Master</p>
            <TautanNav href="/master/sumber-dana" ikon={<Wallet />}>Sumber Dana</TautanNav>
            <TautanNav href="/master/rekening" ikon={<BookOpenText />}>Rekening</TautanNav>
            <TautanNav href="/master/nomenklatur" ikon={<ListTree />}>Nomenklatur</TautanNav>
            <TautanNav href="/master/skpd" ikon={<Building2 />}>Perangkat Daerah</TautanNav>
          </div>
        )}
        {(menu.tahapan || menu.pengguna || menu.audit) && (
          <div className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-redup">Pengaturan</p>
            {menu.tahapan && <TautanNav href="/pengaturan/tahapan" ikon={<Settings2 />}>Tahun & Tahapan</TautanNav>}
            {menu.pengguna && <TautanNav href="/pengaturan/pengguna" ikon={<Users />}>Pengguna</TautanNav>}
            {menu.audit && <TautanNav href="/audit" ikon={<History />}>Log Audit</TautanNav>}
          </div>
        )}
      </nav>
      <div className="border-t border-garis p-3">
        <p className="truncate text-sm font-medium">{pengguna.nama}</p>
        <p className="text-xs text-redup">{pengguna.peran}</p>
        <form action={keluar} className="mt-2">
          <button type="submit" className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-redup hover:bg-latar hover:text-teks">
            <LogOut className="size-4" aria-hidden />
            Keluar
          </button>
        </form>
      </div>
    </div>
  );
}

export function Kerangka({ menu, pengguna, bilah, children }: { menu: Menu; pengguna: { nama: string; peran: string }; bilah: ReactNode; children: ReactNode }) {
  const [buka, setBuka] = useState(false);
  const path = usePathname();
  useEffect(() => setBuka(false), [path]);
  return (
    <div className="flex min-h-screen">
      <PintasanCari />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-garis bg-permukaan lg:block">
        <Navigasi menu={menu} pengguna={pengguna} />
      </aside>
      {buka && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBuka(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 bg-permukaan shadow-xl">
            <button type="button" className="absolute right-2 top-3 rounded p-1.5 text-redup hover:bg-latar" onClick={() => setBuka(false)} aria-label="Tutup menu">
              <X className="size-4" />
            </button>
            <Navigasi menu={menu} pengguna={pengguna} />
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
