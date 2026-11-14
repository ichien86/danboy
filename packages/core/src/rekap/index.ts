import type { AlokasiSipd, DataSipd, Rincian } from '../pembanding';
import { kunciSubkegiatan, urutkan } from '../pembanding';

export type StatusSumberDana = 'pagu_belum_diisi' | 'melebihi' | 'mendekati' | 'aman';

/** Status per sumber dana (Bagian 9). Pelanggaran pagu tidak pernah mengunci, hanya memicu R3. */
export function statusSumberDana(pagu: number | null | undefined, terpakai: number, ambangPersen = 90): StatusSumberDana {
  if (pagu === null || pagu === undefined) return 'pagu_belum_diisi';
  if (terpakai > pagu) return 'melebihi';
  if (pagu > 0 && terpakai * 100 >= pagu * ambangPersen) return 'mendekati';
  if (pagu === 0 && terpakai === 0) return 'aman';
  return 'aman';
}

export interface BarisTerpetakan {
  skpdId: string;
  subUnitId: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  sumberDanaId: string;
  kodeSumberDana: string;
  kodeRekening: string;
  paket?: string;
  namaPaket?: string;
  pagu: number;
}

/** Rekap baris rincian SIPD menjadi satu entri per sub unit × subkegiatan. */
export function rekapSipd(baris: Iterable<BarisTerpetakan>): Map<string, DataSipd> {
  const hasil = new Map<string, DataSipd & { _alok: Map<string, number> }>();
  for (const b of baris) {
    const kunci = kunciSubkegiatan(b.subUnitId, b.kodeSubkegiatan);
    let e = hasil.get(kunci);
    if (!e) {
      e = {
        skpdId: b.skpdId,
        subUnitId: b.subUnitId,
        kodeSubkegiatan: b.kodeSubkegiatan,
        namaSubkegiatan: b.namaSubkegiatan,
        pagu: 0,
        alokasi: [],
        rincian: [],
        _alok: new Map(),
      };
      hasil.set(kunci, e);
    }
    e.pagu += b.pagu;
    e._alok.set(b.sumberDanaId, (e._alok.get(b.sumberDanaId) ?? 0) + b.pagu);
    const r: Rincian = { kodeRekening: b.kodeRekening, kodeSumberDana: b.kodeSumberDana, pagu: b.pagu };
    if (b.paket) r.paket = b.paket;
    if (b.namaPaket) r.namaPaket = b.namaPaket;
    e.rincian.push(r);
  }
  const keluar = new Map<string, DataSipd>();
  for (const [k, e] of hasil) {
    const { _alok, ...rest } = e;
    const alokasi: AlokasiSipd[] = urutkan([..._alok].map(([sumberDanaId, nilai]) => ({ sumberDanaId, nilai })));
    keluar.set(k, { ...rest, alokasi });
  }
  return keluar;
}
