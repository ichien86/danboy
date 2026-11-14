import { describe, expect, it } from 'vitest';
import { adalahKodeSubkegiatan, indukKode, normalisasiKode } from './index';
import { formatRupiah, parseRupiah } from '../rupiah';
import { rekapSipd, statusSumberDana } from '../rekap';
import { parseNomenklatur } from '../nomenklatur';
import { cariSumberSalinan, namaTahapan, urutanTahapan } from '../tahapan';

describe('kode', () => {
  it('normalisasi kode SIPD', () => {
    expect(normalisasiKode('01.01')).toBe('1.01');
    expect(normalisasiKode(' 01.01.02 ')).toBe('1.01.02');
    expect(normalisasiKode('1.01.02.2.01.0025')).toBe('1.01.02.2.01.0025');
    expect(normalisasiKode('0')).toBe('0');
    expect(normalisasiKode(null)).toBe('');
  });
  it('induk kode', () => {
    expect(indukKode('2.2.01.07.001.00004')).toBe('2.2.01.07.001');
    expect(indukKode('1')).toBeUndefined();
  });
  it('pola subkegiatan', () => {
    expect(adalahKodeSubkegiatan('1.01.02.2.01.0025')).toBe(true);
    expect(adalahKodeSubkegiatan('X.XX.01.2.01.0001')).toBe(true);
    expect(adalahKodeSubkegiatan('1.01.02')).toBe(false);
  });
});

describe('rupiah', () => {
  it('parse berbagai format', () => {
    expect(parseRupiah('1.234.567')).toBe(1234567);
    expect(parseRupiah('1.234.567,00')).toBe(1234567);
    expect(parseRupiah('1,234,567.00')).toBe(1234567);
    expect(parseRupiah('Rp 2.500')).toBe(2500);
    expect(parseRupiah(1500)).toBe(1500);
    expect(parseRupiah('12,5')).toBe(12.5);
    expect(parseRupiah('abc')).toBeNull();
    expect(parseRupiah('')).toBeNull();
  });
  it('format', () => {
    expect(formatRupiah(1234567)).toBe('Rp 1.234.567');
    expect(formatRupiah(null)).toBe('–');
    expect(formatRupiah(2_500_000, { juta: true })).toBe('Rp 2,5 jt');
  });
});

describe('rekap', () => {
  it('status sumber dana', () => {
    expect(statusSumberDana(undefined, 10)).toBe('pagu_belum_diisi');
    expect(statusSumberDana(100, 101)).toBe('melebihi');
    expect(statusSumberDana(100, 90)).toBe('mendekati');
    expect(statusSumberDana(100, 100)).toBe('mendekati');
    expect(statusSumberDana(100, 89)).toBe('aman');
  });
  it('rekap baris SIPD per subkegiatan, total sama persis', () => {
    const dasar = { skpdId: 's', subUnitId: 'u', kodeSubkegiatan: 'k', namaSubkegiatan: 'n', kodeRekening: 'r' };
    const m = rekapSipd([
      { ...dasar, sumberDanaId: 'dau', kodeSumberDana: 'D', pagu: 1_000_000_001 },
      { ...dasar, sumberDanaId: 'sg', kodeSumberDana: 'S', pagu: 7 },
      { ...dasar, sumberDanaId: 'dau', kodeSumberDana: 'D', pagu: 3 },
    ]);
    const e = m.get('u|k')!;
    expect(e.pagu).toBe(1_000_000_011);
    expect(e.alokasi).toEqual([
      { sumberDanaId: 'dau', nilai: 1_000_000_004 },
      { sumberDanaId: 'sg', nilai: 7 },
    ]);
    expect(e.rincian).toHaveLength(3);
  });
});

describe('parser nomenklatur', () => {
  it('membaca penanda dan menurunkan induk dari kode', () => {
    const { item, galat } = parseNomenklatur([
      '[URUSAN] 1 URUSAN PEMERINTAHAN WAJIB YANG BERKAITAN DENGAN PELAYANAN DASAR',
      '[BIDANG URUSAN] 01.01 URUSAN PEMERINTAHAN BIDANG PENDIDIKAN',
      '1.01.02.2.01.0001 Pembangunan Unit Sekolah Baru (USB)',
      '[PROGRAM] 1.01.02 PROGRAM PENGELOLAAN PENDIDIKAN',
      '[KEGIATAN] 1.01.02.2.01 Pengelolaan Pendidikan Sekolah Dasar',
      '',
      '[ANEH] 9 x',
    ]);
    expect(item.map((i) => [i.jenis, i.kode, i.indukKode])).toEqual([
      ['urusan', '1', undefined],
      ['bidang', '1.01', '1'],
      ['subkegiatan', '1.01.02.2.01.0001', '1.01.02.2.01'],
      ['program', '1.01.02', '1.01'],
      ['kegiatan', '1.01.02.2.01', '1.01.02'],
    ]);
    expect(galat).toHaveLength(1);
  });
});

describe('tahapan', () => {
  it('urutan, nama, dan sumber salinan', () => {
    expect(urutanTahapan('PERGESERAN', 2)).toBe(5);
    expect(namaTahapan('PERGESERAN', 2027, 2)).toBe('Pergeseran II 2027');
    expect(namaTahapan('KUA_PPAS', 2027)).toBe('KUA-PPAS 2027');
    const semua = [{ urutan: 1 }, { urutan: 2 }, { urutan: 3 }, { urutan: 4 }];
    expect(cariSumberSalinan(semua, { urutan: 1000 })).toEqual({ urutan: 4 });
    expect(cariSumberSalinan(semua, { urutan: 1 })).toBeUndefined();
  });
});
