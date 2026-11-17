const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export function formatRupiah(n: number | null | undefined, opsi: { juta?: boolean; tanpaRp?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  if (opsi.juta) {
    const j = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n / 1_000_000);
    return `${opsi.tanpaRp ? '' : 'Rp'}${j} jt`;
  }
  // tanpa spasi: Rp2.000.000; nilai negatif ditulis -Rp2.000.000
  return `${n < 0 ? '-' : ''}${opsi.tanpaRp ? '' : 'Rp'}${fmt.format(Math.abs(n))}`;
}

/**
 * Membaca angka rupiah dari sel Excel/CSV. Menerima format Indonesia (1.234.567,00),
 * format Inggris (1,234,567.00), dan angka biasa. Mengembalikan null bila bukan angka.
 */
export function parseRupiah(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  s = s.replace(/^Rp\.?\s*/i, '').replace(/\s/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const jumlah = (xs: { nilai: number }[]) => xs.reduce((a, b) => a + b.nilai, 0);
