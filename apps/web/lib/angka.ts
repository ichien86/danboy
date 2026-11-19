/** Angka dengan pemisah ribuan titik (id-ID), mis. 1.234. Aman dipakai di komponen server maupun klien. */
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
export const angka = (n: unknown): string =>
  typeof n === 'number' && !Number.isNaN(n) ? fmt.format(n) : n === null || n === undefined || typeof n === 'number' ? '–' : String(n);
