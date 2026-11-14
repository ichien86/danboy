import { describe, expect, it } from 'vitest';
import { banding, hashKomposisi, ikutSipd, terapkanEditAdmin, type DataSipd, type Operasi, type Tersimpan } from './index';

type OpUbah = Extract<Operasi, { jenis: 'ubah' }>;
type OpTambah = Extract<Operasi, { jenis: 'tambah' }>;

const K = 'su1|1.01.02.2.01.0025';
const sipd = (alokasi: [string, number][], pagu?: number): DataSipd => {
  const total = pagu ?? alokasi.reduce((a, [, n]) => a + n, 0);
  return {
    skpdId: 'skpd1',
    subUnitId: 'su1',
    kodeSubkegiatan: '1.01.02.2.01.0025',
    namaSubkegiatan: 'Pengadaan Perlengkapan',
    pagu: total,
    alokasi: alokasi.map(([sumberDanaId, nilai]) => ({ sumberDanaId, nilai })),
    rincian: [{ kodeRekening: '5.1.02', kodeSumberDana: 'x', pagu: total }],
  };
};
const dariSipd = (s: DataSipd, ubah: Partial<Tersimpan> = {}): Tersimpan => ({
  id: 'id1',
  pagu: s.pagu,
  status: 'aktif',
  namaSubkegiatan: s.namaSubkegiatan,
  alokasi: s.alokasi.map((a) => ({ ...a, nilaiSipd: a.nilai, asal: 'sipd' as const })),
  alokasiSipd: s.alokasi,
  beda: { ada: false },
  seimbang: true,
  rincian: s.rincian,
  ...ubah,
});

describe('banding', () => {
  it('R7: subkegiatan baru ditambahkan dengan alokasi ikut SIPD', () => {
    const s = sipd([
      ['dau', 100],
      ['sg', 50],
    ]);
    const h = banding(new Map(), new Map([[K, s]]));
    expect(h.operasi).toHaveLength(1);
    expect(h.temuan.map((t) => t.aturan)).toEqual(['R7']);
    const op = h.operasi[0] as OpTambah;
    expect(op.jenis).toBe('tambah');
    expect(op.data.seimbang).toBe(true);
    expect(op.data.alokasi.every((a) => a.asal === 'sipd')).toBe(true);
  });

  it('impor ulang data yang sama menghasilkan nol operasi', () => {
    const s = sipd([
      ['dau', 100],
      ['sg', 50],
    ]);
    const h = banding(new Map([[K, dariSipd(s)]]), new Map([[K, s]]));
    expect(h.operasi).toEqual([]);
    expect(h.temuan).toEqual([]);
  });

  it('R8: subkegiatan tidak ada di impor ditandai, sekali saja', () => {
    const s = sipd([['dau', 100]]);
    const h = banding(new Map([[K, dariSipd(s)]]), new Map());
    expect(h.operasi).toEqual([{ jenis: 'tandai_hilang', kunci: K, id: 'id1' }]);
    expect(h.temuan[0].aturan).toBe('R8');
    const h2 = banding(new Map([[K, dariSipd(s, { status: 'tidak_ada_di_impor' })]]), new Map());
    expect(h2.operasi).toEqual([]);
  });

  it('R8 pulih: muncul lagi di impor berikutnya mengaktifkan kembali', () => {
    const s = sipd([['dau', 100]]);
    const h = banding(new Map([[K, dariSipd(s, { status: 'tidak_ada_di_impor' })]]), new Map([[K, s]]));
    expect(h.operasi[0]).toMatchObject({ jenis: 'ubah', set: { status: 'aktif' } });
  });

  it('R1: pagu berubah, sumber dana sama dan semua asal SIPD -> nilai ikut SIPD', () => {
    const lama = sipd([
      ['dau', 100],
      ['sg', 50],
    ]);
    const baru = sipd([
      ['dau', 120],
      ['sg', 50],
    ]);
    const h = banding(new Map([[K, dariSipd(lama)]]), new Map([[K, baru]]));
    expect(h.temuan.map((t) => t.aturan)).toEqual(['R1', 'R1']);
    const op = h.operasi[0] as OpUbah;
    expect(op.set.pagu).toBe(170);
    expect(op.set.alokasi?.find((a) => a.sumberDanaId === 'dau')?.nilai).toBe(120);
    expect(op.set.beda).toBeUndefined();
    expect(op.set.seimbang).toBeUndefined();
  });

  it('R2: sumber dana berganti masuk daftar perbedaan, alokasi tersimpan tidak diubah', () => {
    const lama = sipd([['dau', 100]]);
    const baru = sipd([['dak', 100]]);
    const h = banding(new Map([[K, dariSipd(lama)]]), new Map([[K, baru]]));
    expect(h.temuan.map((t) => t.aturan)).toEqual(['R2']);
    const op = h.operasi[0] as OpUbah;
    expect(op.set.beda).toEqual({ ada: true, hashSipd: hashKomposisi([{ sumberDanaId: 'dak', nilai: 100 }]) });
    expect(op.set.alokasi).toEqual([{ sumberDanaId: 'dau', nilai: 100, nilaiSipd: 0, asal: 'sipd' }]);
    expect(op.set.alokasiSipd).toEqual([{ sumberDanaId: 'dak', nilai: 100 }]);
  });

  it('R2: perbedaan yang sudah diputuskan tidak muncul lagi selama komposisi SIPD sama', () => {
    const baru = sipd([['dak', 100]]);
    const hash = hashKomposisi(baru.alokasi);
    const t = dariSipd(baru, {
      alokasi: [{ sumberDanaId: 'dau', nilai: 100, nilaiSipd: 0, asal: 'admin' }],
      beda: { ada: false, diputuskan: 'edit_sendiri', hashSipd: hash },
    });
    expect(banding(new Map([[K, t]]), new Map([[K, baru]])).operasi).toEqual([]);
    const lagi = sipd([
      ['dak', 60],
      ['dau', 40],
    ]);
    const h = banding(new Map([[K, t]]), new Map([[K, lagi]]));
    expect(h.temuan.map((x) => x.aturan)).toEqual(['R2']);
  });

  it('alokasi admin tidak ditimpa saat pagu SIPD naik; jadi tidak seimbang (R4)', () => {
    const lama = sipd([
      ['dau', 100],
      ['sg', 50],
    ]);
    const t = dariSipd(lama, {
      alokasi: [
        { sumberDanaId: 'dau', nilai: 80, nilaiSipd: 100, asal: 'admin' },
        { sumberDanaId: 'sg', nilai: 70, nilaiSipd: 50, asal: 'admin' },
      ],
      beda: { ada: false, diputuskan: 'edit_sendiri', hashSipd: hashKomposisi(lama.alokasi) },
    });
    const baru = sipd([
      ['dau', 150],
      ['sg', 50],
    ]);
    const h = banding(new Map([[K, t]]), new Map([[K, baru]]));
    const op = h.operasi[0] as OpUbah;
    expect(op.set.alokasi?.map((a) => a.nilai)).toEqual([80, 70]);
    expect(op.set.alokasi?.map((a) => a.nilaiSipd)).toEqual([150, 50]);
    expect(op.set.seimbang).toBe(false);
    expect(h.temuan.map((x) => x.aturan)).toEqual(['R1', 'R2']);
  });

  it('komposisi sama setelah keputusan: perbedaan lama ditutup', () => {
    const s = sipd([['dau', 100]]);
    const t = dariSipd(s, { beda: { ada: true, hashSipd: 'lama' } });
    const op = banding(new Map([[K, t]]), new Map([[K, s]])).operasi[0] as OpUbah;
    expect(op.set.beda).toEqual({ ada: false });
  });
});

describe('keputusan Admin', () => {
  it('Ikut SIPD menyalin komposisi SIPD', () => {
    const r = ikutSipd({ pagu: 100, alokasiSipd: [{ sumberDanaId: 'dak', nilai: 100 }] });
    expect(r.alokasi).toEqual([{ sumberDanaId: 'dak', nilai: 100, nilaiSipd: 100, asal: 'sipd' }]);
    expect(r.seimbang).toBe(true);
  });
  it('Edit Sendiri menandai asal admin hanya pada baris yang berbeda', () => {
    const r = terapkanEditAdmin(
      [
        { sumberDanaId: 'dau', nilai: 60 },
        { sumberDanaId: 'sg', nilai: 50 },
      ],
      [
        { sumberDanaId: 'dau', nilai: 100 },
        { sumberDanaId: 'sg', nilai: 50 },
      ],
      150,
    );
    expect(r.alokasi.map((a) => a.asal)).toEqual(['admin', 'sipd']);
    expect(r.seimbang).toBe(false);
  });
});
