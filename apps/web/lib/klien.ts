'use client';

export class GalatApi extends Error {
  constructor(
    public kode: string,
    pesan: string,
    public status: number,
    public detail?: Record<string, string>,
  ) {
    super(pesan);
  }
}

/** fetch JSON ke /api dengan format galat seragam { galat: { kode, pesan, detail } }. */
export async function api<T = unknown>(path: string, opsi: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opsi.method ?? (opsi.body || opsi.form ? 'POST' : 'GET'),
    headers: opsi.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opsi.form ?? (opsi.body !== undefined ? JSON.stringify(opsi.body) : undefined),
    cache: 'no-store',
  });
  const teks = await res.text();
  let data: unknown = null;
  try {
    data = teks ? JSON.parse(teks) : null;
  } catch {
    /* bukan JSON */
  }
  if (!res.ok) {
    const g = (data as { galat?: { kode: string; pesan: string; detail?: Record<string, string> } })?.galat;
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
    throw new GalatApi(g?.kode ?? 'GALAT', g?.pesan ?? `Permintaan gagal (${res.status})`, res.status, g?.detail);
  }
  return data as T;
}

export const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan');

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const rp = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `Rp${fmt.format(n)}`);

/** Baca angka rupiah dari input pengguna: hanya digit, pemisah ribuan diabaikan. */
export function bacaAngka(s: string): number | null {
  const d = s.replace(/[^\d]/g, '');
  if (!d) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) ? n : null;
}
export const tulisAngka = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmt.format(n));
