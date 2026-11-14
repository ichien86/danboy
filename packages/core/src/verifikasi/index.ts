/**
 * Verifikasi input SIPD: alokasi sumber dana di aplikasi menjadi ACUAN, file SIPD dicek terhadapnya.
 * Fungsi murni, tidak mengubah data. Dikunci di tingkat kode (kodeSubUnit|kodeSubkegiatan, kode sumber dana)
 * agar file dengan SKPD/sub unit/sumber dana yang belum ada di master tetap bisa diperiksa.
 */

export type StatusVerifikasi = 'sesuai' | 'nilai_berbeda' | 'sumber_dana_berbeda' | 'tidak_ada_di_aplikasi' | 'tidak_ada_di_sipd';

export const URUTAN_STATUS: StatusVerifikasi[] = ['sumber_dana_berbeda', 'nilai_berbeda', 'tidak_ada_di_sipd', 'tidak_ada_di_aplikasi', 'sesuai'];

export interface RincianVerifikasi {
  kodeRekening: string;
  kodeSumberDana: string;
  namaSumberDana?: string;
  paket?: string;
  namaPaket?: string;
  pagu: number;
}

export interface DataVerifikasi {
  kodeSkpd: string;
  namaSkpd: string;
  kodeSubUnit: string;
  namaSubUnit: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  /** nilai per kode sumber dana */
  alokasi: { kode: string; nilai: number }[];
  rincian?: RincianVerifikasi[];
}

export interface BarisSumberDana {
  kodeSumberDana: string;
  nilaiAplikasi: number;
  nilaiSipd: number;
  /** nilaiSipd − nilaiAplikasi */
  selisih: number;
}

export interface HasilVerifikasi {
  kunci: string;
  status: StatusVerifikasi;
  kodeSkpd: string;
  namaSkpd: string;
  kodeSubUnit: string;
  namaSubUnit: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  paguAplikasi: number | null;
  paguSipd: number | null;
  baris: BarisSumberDana[];
  /** Baris rincian SIPD yang memakai sumber dana yang tidak dialokasikan aplikasi untuk subkegiatan ini. */
  rincianSalah: RincianVerifikasi[];
}

export const kunciVerifikasi = (kodeSubUnit: string, kodeSubkegiatan: string) => `${kodeSubUnit}|${kodeSubkegiatan}`;

const peta = (xs: { kode: string; nilai: number }[]) => {
  const m = new Map<string, number>();
  for (const x of xs) if (x.nilai !== 0) m.set(x.kode, (m.get(x.kode) ?? 0) + x.nilai);
  return m;
};

export function verifikasi(aplikasi: Map<string, DataVerifikasi>, sipd: Map<string, DataVerifikasi>): HasilVerifikasi[] {
  const hasil: HasilVerifikasi[] = [];
  const kunciSemua = [...new Set([...aplikasi.keys(), ...sipd.keys()])].sort();
  for (const kunci of kunciSemua) {
    const a = aplikasi.get(kunci);
    const s = sipd.get(kunci);
    const info = (s ?? a)!;
    const dasar = {
      kunci,
      kodeSkpd: info.kodeSkpd,
      namaSkpd: (a ?? s)!.namaSkpd,
      kodeSubUnit: info.kodeSubUnit,
      namaSubUnit: (a ?? s)!.namaSubUnit,
      kodeSubkegiatan: info.kodeSubkegiatan,
      namaSubkegiatan: s?.namaSubkegiatan || a?.namaSubkegiatan || '',
      paguAplikasi: a ? a.pagu : null,
      paguSipd: s ? s.pagu : null,
    };
    const pa = peta(a?.alokasi ?? []);
    const ps = peta(s?.alokasi ?? []);
    const kodeSd = [...new Set([...pa.keys(), ...ps.keys()])].sort();
    const baris: BarisSumberDana[] = kodeSd.map((k) => {
      const nilaiAplikasi = pa.get(k) ?? 0;
      const nilaiSipd = ps.get(k) ?? 0;
      return { kodeSumberDana: k, nilaiAplikasi, nilaiSipd, selisih: nilaiSipd - nilaiAplikasi };
    });

    let status: StatusVerifikasi;
    let rincianSalah: RincianVerifikasi[] = [];
    if (!a) status = 'tidak_ada_di_aplikasi';
    else if (!s) status = 'tidak_ada_di_sipd';
    else if (baris.every((b) => b.selisih === 0)) status = 'sesuai';
    else {
      const samaSet = [...pa.keys()].sort().join('|') === [...ps.keys()].sort().join('|');
      status = samaSet ? 'nilai_berbeda' : 'sumber_dana_berbeda';
      if (!samaSet) rincianSalah = (s.rincian ?? []).filter((r) => !pa.has(r.kodeSumberDana) && r.pagu !== 0);
    }
    hasil.push({ ...dasar, status, baris, rincianSalah });
  }
  return hasil;
}

export interface RingkasanSkpd {
  kodeSkpd: string;
  namaSkpd: string;
  jumlah: number;
  tidakSesuai: number;
  perStatus: Record<StatusVerifikasi, number>;
}

const kosong = (): Record<StatusVerifikasi, number> => ({
  sesuai: 0,
  nilai_berbeda: 0,
  sumber_dana_berbeda: 0,
  tidak_ada_di_aplikasi: 0,
  tidak_ada_di_sipd: 0,
});

export function ringkasVerifikasi(hasil: HasilVerifikasi[]) {
  const perStatus = kosong();
  const perSkpd = new Map<string, RingkasanSkpd>();
  let rincianSalah = 0;
  for (const h of hasil) {
    perStatus[h.status]++;
    rincianSalah += h.rincianSalah.length;
    let r = perSkpd.get(h.kodeSkpd);
    if (!r) perSkpd.set(h.kodeSkpd, (r = { kodeSkpd: h.kodeSkpd, namaSkpd: h.namaSkpd, jumlah: 0, tidakSesuai: 0, perStatus: kosong() }));
    r.jumlah++;
    r.perStatus[h.status]++;
    if (h.status !== 'sesuai') r.tidakSesuai++;
  }
  return {
    jumlah: hasil.length,
    sesuai: perStatus.sesuai,
    tidakSesuai: hasil.length - perStatus.sesuai,
    perStatus,
    rincianSalah,
    perSkpd: [...perSkpd.values()].sort((x, y) => y.tidakSesuai - x.tidakSesuai || x.kodeSkpd.localeCompare(y.kodeSkpd)),
  };
}
