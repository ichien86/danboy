export type JenisTahapan = 'KUA_PPAS' | 'RAPBD' | 'APBD' | 'PERGESERAN' | 'PERUBAHAN';

export const LABEL_TAHAPAN: Record<JenisTahapan, string> = {
  KUA_PPAS: 'KUA-PPAS',
  RAPBD: 'RAPBD',
  APBD: 'APBD',
  PERGESERAN: 'Pergeseran',
  PERUBAHAN: 'Perubahan',
};

const ROMAWI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Urutan baku: KUA-PPAS 1, RAPBD 2, APBD 3, Pergeseran ke-n 3+n, Perubahan terakhir. */
export function urutanTahapan(jenis: JenisTahapan, ke = 1): number {
  switch (jenis) {
    case 'KUA_PPAS':
      return 1;
    case 'RAPBD':
      return 2;
    case 'APBD':
      return 3;
    case 'PERGESERAN':
      return 3 + ke;
    case 'PERUBAHAN':
      return 1000;
  }
}

export function namaTahapan(jenis: JenisTahapan, tahun: number, ke = 1): string {
  if (jenis === 'PERGESERAN') return `Pergeseran ${ROMAWI[ke] ?? ke} ${tahun}`;
  return `${LABEL_TAHAPAN[jenis]} ${tahun}`;
}

/** Tahapan sumber salinan: urutan tepat di bawahnya pada tahun yang sama. */
export function cariSumberSalinan<T extends { urutan: number }>(semua: T[], target: { urutan: number }): T | undefined {
  return semua.filter((t) => t.urutan < target.urutan).sort((a, b) => b.urutan - a.urutan)[0];
}
