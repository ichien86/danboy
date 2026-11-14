import { indukKode, normalisasiKode, adalahKodeSubkegiatan } from '../kode';

export type JenisNomenklatur = 'urusan' | 'bidang' | 'program' | 'kegiatan' | 'subkegiatan';

export interface ItemNomenklatur {
  jenis: JenisNomenklatur;
  kode: string;
  nama: string;
  indukKode?: string;
}

const PENANDA: Record<string, JenisNomenklatur> = {
  URUSAN: 'urusan',
  'BIDANG URUSAN': 'bidang',
  PROGRAM: 'program',
  KEGIATAN: 'kegiatan',
  'SUB KEGIATAN': 'subkegiatan',
  SUBKEGIATAN: 'subkegiatan',
};

/** Induk diturunkan dari kode itu sendiri, bukan dari urutan baris. Kegiatan (1.01.02.2.01) berinduk program (1.01.02). */
export function indukNomenklatur(jenis: JenisNomenklatur, kode: string): string | undefined {
  if (jenis === 'urusan') return undefined;
  if (jenis === 'kegiatan') {
    const p = indukKode(kode);
    return p ? indukKode(p) : undefined;
  }
  return indukKode(kode);
}

/** Parser format satu kolom dengan penanda [URUSAN], [BIDANG URUSAN], [PROGRAM], [KEGIATAN] di awal baris. */
export function parseNomenklatur(baris: string[]): { item: ItemNomenklatur[]; galat: { noBaris: number; teks: string }[] } {
  const item: ItemNomenklatur[] = [];
  const galat: { noBaris: number; teks: string }[] = [];
  const terlihat = new Set<string>();
  baris.forEach((mentah, i) => {
    const teks = String(mentah ?? '').replace(/\s+/g, ' ').trim();
    if (!teks) return;
    let jenis: JenisNomenklatur | undefined;
    let sisa = teks;
    const m = teks.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      jenis = PENANDA[m[1].trim().toUpperCase()];
      sisa = m[2];
      if (!jenis) {
        galat.push({ noBaris: i + 1, teks });
        return;
      }
    }
    const mk = sisa.match(/^(\S+)\s+(.+)$/);
    if (!mk) {
      galat.push({ noBaris: i + 1, teks });
      return;
    }
    const kode = normalisasiKode(mk[1]);
    const nama = mk[2].trim();
    if (!jenis) {
      if (!adalahKodeSubkegiatan(kode)) {
        // baris judul/keterangan tanpa kode: lewati diam-diam bila tidak diawali angka
        if (/^[0-9X]/.test(kode)) galat.push({ noBaris: i + 1, teks });
        return;
      }
      jenis = 'subkegiatan';
    }
    const kunci = `${jenis}|${kode}`;
    if (terlihat.has(kunci)) return;
    terlihat.add(kunci);
    const induk = indukNomenklatur(jenis, kode);
    item.push(induk ? { jenis, kode, nama, indukKode: induk } : { jenis, kode, nama });
  });
  return { item, galat };
}
