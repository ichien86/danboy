import Link from 'next/link';
import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { angka } from '@/lib/angka';

export const cx = clsx;

type Varian = 'utama' | 'biasa' | 'hantu' | 'bahaya';
const varian: Record<Varian, string> = {
  utama: 'bg-utama text-utama-teks hover:bg-utama/90 border-transparent',
  biasa: 'bg-permukaan text-teks border-garis hover:bg-latar',
  hantu: 'bg-transparent text-teks border-transparent hover:bg-latar',
  bahaya: 'bg-bahaya text-white border-transparent hover:bg-bahaya/90',
};

export const Tombol = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { varian?: Varian; kecil?: boolean; memuat?: boolean }>(
  function Tombol({ varian: v = 'biasa', kecil, memuat, className, children, disabled, ...p }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          kecil ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
          varian[v],
          className,
        )}
        disabled={disabled || memuat}
        aria-busy={memuat || undefined}
        {...p}
      >
        {memuat && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
        {children}
      </button>
    );
  },
);

export function TautanTombol({ href, varian: v = 'biasa', kecil, className, children }: { href: string; varian?: Varian; kecil?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors',
        kecil ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        varian[v],
        className,
      )}
    >
      {children}
    </Link>
  );
}

const kelasInput =
  'h-9 w-full rounded-md border border-garis bg-permukaan px-3 text-sm text-teks placeholder:text-redup/70 focus:border-utama focus:outline-none focus:ring-2 focus:ring-utama/20 disabled:opacity-60';

export const Masukan = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Masukan({ className, ...p }, ref) {
  return <input ref={ref} className={cx(kelasInput, className)} {...p} />;
});

export const Pilihan = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Pilihan({ className, ...p }, ref) {
  return <select ref={ref} className={cx(kelasInput, 'pr-8', className)} {...p} />;
});

export const AreaTeks = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AreaTeks({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(kelasInput, 'h-auto min-h-20 py-2', className)} {...p} />;
});

export function Bidang({ label, galat, bantuan, children, htmlFor }: { label: string; galat?: string; bantuan?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {galat ? <p className="text-xs text-bahaya">{galat}</p> : bantuan ? <p className="text-xs text-redup">{bantuan}</p> : null}
    </div>
  );
}

export function Kartu({ judul, aksi, children, className, padat }: { judul?: ReactNode; aksi?: ReactNode; children: ReactNode; className?: string; padat?: boolean }) {
  return (
    <section className={cx('rounded-lg border border-garis bg-permukaan', className)}>
      {(judul || aksi) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-garis px-4 py-3">
          {judul && <h2 className="text-sm font-semibold">{judul}</h2>}
          {aksi}
        </header>
      )}
      <div className={padat ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

type Nada = 'netral' | 'aman' | 'waspada' | 'bahaya' | 'info' | 'utama';
const nada: Record<Nada, string> = {
  netral: 'bg-latar text-redup border-garis',
  aman: 'bg-aman-lembut text-aman border-aman/30',
  waspada: 'bg-waspada-lembut text-waspada border-waspada/30',
  bahaya: 'bg-bahaya-lembut text-bahaya border-bahaya/30',
  info: 'bg-info-lembut text-info border-info/30',
  utama: 'bg-utama-lembut text-utama border-utama/30',
};

export function Lencana({ nada: n = 'netral', children, className, title }: { nada?: Nada; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium', nada[n], className)}>
      {children}
    </span>
  );
}

export function Peringatan({ nada: n = 'info', judul, children }: { nada?: Nada; judul?: string; children?: ReactNode }) {
  return (
    <div role={n === 'bahaya' ? 'alert' : 'status'} className={cx('rounded-md border px-3 py-2.5 text-sm', nada[n])}>
      {judul && <p className="font-semibold">{judul}</p>}
      {children && <div className={judul ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}

export function KepalaHalaman({ judul, sub, aksi }: { judul: string; sub?: ReactNode; aksi?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{judul}</h1>
        {sub && <p className="mt-1 text-sm text-redup">{sub}</p>}
      </div>
      {aksi && <div className="flex flex-wrap items-center gap-2">{aksi}</div>}
    </div>
  );
}

export function Tabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function TH({ children, kanan, className }: { children?: ReactNode; kanan?: boolean; className?: string }) {
  return (
    <th scope="col" className={cx('whitespace-nowrap border-b border-garis bg-latar/60 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-redup', kanan && 'text-right', className)}>
      {children}
    </th>
  );
}
export function TD({ children, kanan, className, colSpan }: { children?: ReactNode; kanan?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx('border-b border-garis px-3 py-2 align-top', kanan && 'angka text-right', className)}>
      {children}
    </td>
  );
}

export function Kosong({ judul, children }: { judul: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium">{judul}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-redup">{children}</div>}
    </div>
  );
}

/** Paginasi berbasis tautan; mempertahankan parameter lain di URL. */
export function Paginasi({ total, page, limit, dasar, param }: { total: number; page: number; limit: number; dasar: string; param: Record<string, string | undefined> }) {
  const halaman = Math.max(1, Math.ceil(total / limit));
  if (halaman <= 1) return <p className="px-4 py-3 text-xs text-redup">{angka(total)} data</p>;
  const ke = (p: number) => {
    const sp = new URLSearchParams(Object.entries(param).filter(([, v]) => v) as [string, string][]);
    sp.set('page', String(p));
    return `${dasar}?${sp}`;
  };
  return (
    <nav className="flex items-center justify-between gap-2 px-4 py-3 text-sm" aria-label="Paginasi">
      <span className="text-xs text-redup">
        {angka((page - 1) * limit + 1)}–{angka(Math.min(page * limit, total))} dari {angka(total)}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? <TautanTombol kecil href={ke(page - 1)}>Sebelumnya</TautanTombol> : <Tombol kecil disabled>Sebelumnya</Tombol>}
        <span className="flex items-center px-2 text-xs text-redup">
          {angka(page)} / {angka(halaman)}
        </span>
        {page < halaman ? <TautanTombol kecil href={ke(page + 1)}>Berikutnya</TautanTombol> : <Tombol kecil disabled>Berikutnya</Tombol>}
      </div>
    </nav>
  );
}

export function Statistik({ label, nilai, sub, nada: n }: { label: string; nilai: ReactNode; sub?: ReactNode; nada?: Nada }) {
  return (
    <div className="rounded-lg border border-garis bg-permukaan p-4">
      <p className="text-xs font-medium text-redup">{label}</p>
      <p className={cx('angka mt-1 text-xl font-semibold', n === 'bahaya' && 'text-bahaya', n === 'waspada' && 'text-waspada', n === 'aman' && 'text-aman')}>{typeof nilai === 'number' ? angka(nilai) : nilai}</p>
      {sub && <p className="mt-0.5 text-xs text-redup">{sub}</p>}
    </div>
  );
}
