import { describe, expect, it } from 'vitest';
import { ringkasVerifikasi, verifikasi, type DataVerifikasi } from './index';

const d = (kodeSub: string, alokasi: [string, number][], ubah: Partial<DataVerifikasi> = {}): DataVerifikasi => ({
  kodeSkpd: 'S1',
  namaSkpd: 'Dinas A',
  kodeSubUnit: 'U1',
  namaSubUnit: 'Dinas A',
  kodeSubkegiatan: kodeSub,
  namaSubkegiatan: `Sub ${kodeSub}`,
  pagu: alokasi.reduce((a, [, n]) => a + n, 0),
  alokasi: alokasi.map(([kode, nilai]) => ({ kode, nilai })),
  ...ubah,
});
const m = (...xs: DataVerifikasi[]) => new Map(xs.map((x) => [`${x.kodeSubUnit}|${x.kodeSubkegiatan}`, x]));

describe('verifikasi input SIPD terhadap aplikasi', () => {
  it('membedakan sesuai, nilai berbeda, sumber dana berbeda, dan yang hilang di salah satu sisi', () => {
    const aplikasi = m(d('A', [['DAU', 100]]), d('B', [['DAU', 100], ['SG', 50]]), d('C', [['DAU', 100]]), d('D', [['PAD', 10]]));
    const sipd = m(
      d('A', [['DAU', 100]]),
      d('B', [['DAU', 120], ['SG', 30]]),
      d('C', [['DAK', 100]], {
        rincian: [
          { kodeRekening: '5.1', kodeSumberDana: 'DAK', pagu: 100 },
          { kodeRekening: '5.2', kodeSumberDana: 'DAU', pagu: 0 },
        ],
      }),
      d('E', [['DAU', 5]]),
    );
    const h = verifikasi(aplikasi, sipd);
    expect(Object.fromEntries(h.map((x) => [x.kodeSubkegiatan, x.status]))).toEqual({
      A: 'sesuai',
      B: 'nilai_berbeda',
      C: 'sumber_dana_berbeda',
      D: 'tidak_ada_di_sipd',
      E: 'tidak_ada_di_aplikasi',
    });
    const b = h.find((x) => x.kodeSubkegiatan === 'B')!;
    expect(b.baris).toEqual([
      { kodeSumberDana: 'DAU', nilaiAplikasi: 100, nilaiSipd: 120, selisih: 20 },
      { kodeSumberDana: 'SG', nilaiAplikasi: 50, nilaiSipd: 30, selisih: -20 },
    ]);
    const c = h.find((x) => x.kodeSubkegiatan === 'C')!;
    expect(c.rincianSalah).toEqual([{ kodeRekening: '5.1', kodeSumberDana: 'DAK', pagu: 100 }]);
    expect(h.find((x) => x.kodeSubkegiatan === 'D')!.paguSipd).toBeNull();
  });

  it('nilai nol dan urutan baris tidak memengaruhi hasil', () => {
    const h = verifikasi(m(d('A', [['SG', 50], ['DAU', 100], ['PAD', 0]])), m(d('A', [['DAU', 60], ['SG', 50], ['DAU', 40]])));
    expect(h[0].status).toBe('sesuai');
  });

  it('ringkasan per SKPD diurutkan dari yang paling banyak tidak sesuai', () => {
    const h = verifikasi(
      m(d('A', [['DAU', 1]]), d('B', [['DAU', 1]], { kodeSkpd: 'S2', namaSkpd: 'Dinas B' })),
      m(d('A', [['DAU', 1]]), d('B', [['DAK', 1]], { kodeSkpd: 'S2', namaSkpd: 'Dinas B' })),
    );
    const r = ringkasVerifikasi(h);
    expect(r.sesuai).toBe(1);
    expect(r.tidakSesuai).toBe(1);
    expect(r.perSkpd.map((x) => [x.kodeSkpd, x.tidakSesuai])).toEqual([
      ['S2', 1],
      ['S1', 0],
    ]);
  });
});
