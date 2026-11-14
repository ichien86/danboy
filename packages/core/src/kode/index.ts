/**
 * Ekspor SIPD menulis KODE BIDANG URUSAN 01.01, nomenklatur memakai 1.01.
 * Buang nol di depan segmen pertama dan semua spasi.
 */
export function normalisasiKode(kode: unknown): string {
  const s = String(kode ?? '').replace(/\s+/g, '');
  if (!s) return s;
  const seg = s.split('.');
  seg[0] = seg[0].replace(/^0+(?=[0-9])/, '');
  return seg.join('.');
}

/** Kode induk = kode tanpa segmen terakhir. */
export function indukKode(kode: string): string | undefined {
  const i = kode.lastIndexOf('.');
  return i < 0 ? undefined : kode.slice(0, i);
}

/** 1.01.02.2.01.0025 (17 karakter). Segmen pertama/kedua boleh berisi X untuk urusan penunjang. */
export const POLA_SUBKEGIATAN = /^[0-9X]{1,2}\.[0-9X]{2}\.\d{2}\.\d\.\d{2}\.\d{4}$/;

export const adalahKodeSubkegiatan = (kode: string) => POLA_SUBKEGIATAN.test(kode);

/**
 * Subkegiatan penunjang ditulis di nomenklatur dengan urusan/bidang "X.XX" (mis. X.XX.01.2.02.0001); di APBD SIPD
 * dua segmen pertama diganti urusan & bidang SKPD pelaksananya (mis. 1.01.01.2.02.0001 di Dinas Pendidikan).
 * Mengembalikan bentuk "X.XX.…" dari sebuah kode, atau undefined bila kode itu sendiri sudah berbentuk X.
 */
export function kodeTemplateNomenklatur(kode: string): string | undefined {
  const seg = kode.split('.');
  if (seg.length < 3 || seg[0].toUpperCase() === 'X') return undefined;
  return ['X', 'XX', ...seg.slice(2)].join('.');
}

/** Kode yang dicoba saat mencocokkan dengan master nomenklatur: kode persis, lalu bentuk X.XX-nya. */
export function kandidatKodeNomenklatur(kode: string): string[] {
  const t = kodeTemplateNomenklatur(kode);
  return t ? [kode, t] : [kode];
}

export const adaDiNomenklatur = (kodeAktif: Set<string>, kode: string) => kandidatKodeNomenklatur(kode).some((k) => kodeAktif.has(k));
