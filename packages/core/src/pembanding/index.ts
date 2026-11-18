/**
 * Mesin pembanding (Bagian 8 TDD): fungsi murni tanpa akses basis data.
 * Masukan: data tersimpan satu tahapan dan hasil rekap SIPD, keduanya dikunci `subUnitId|kodeSubkegiatan`.
 * Keluaran: daftar operasi yang akan diterapkan dan temuan untuk pratinjau.
 */

export type Asal = 'sipd' | 'admin';

export interface AlokasiSipd {
  sumberDanaId: string;
  nilai: number;
}

export interface AlokasiTersimpan {
  sumberDanaId: string;
  nilai: number;
  nilaiSipd: number;
  asal: Asal;
}

export interface Beda {
  ada: boolean;
  hashSipd?: string;
  diputuskan?: 'ikut_sipd' | 'edit_sendiri';
  oleh?: string;
  pada?: Date | string;
}

export interface Rincian {
  kodeRekening: string;
  kodeSumberDana: string;
  paket?: string;
  namaPaket?: string;
  pagu: number;
}

export interface Tersimpan {
  id: string;
  pagu: number;
  status: 'aktif' | 'tidak_ada_di_impor';
  alokasi: AlokasiTersimpan[];
  alokasiSipd: AlokasiSipd[];
  beda: Beda;
  seimbang: boolean;
  namaSubkegiatan?: string;
  rincian: Rincian[];
}

export interface DataSipd {
  skpdId: string;
  subUnitId: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  alokasi: AlokasiSipd[];
  rincian: Rincian[];
}

export interface DataBaru {
  skpdId: string;
  subUnitId: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  status: 'aktif';
  alokasi: AlokasiTersimpan[];
  alokasiSipd: AlokasiSipd[];
  beda: Beda;
  seimbang: boolean;
  rincian: Rincian[];
}

export type Perubahan = Partial<
  Pick<Tersimpan, 'pagu' | 'status' | 'alokasi' | 'alokasiSipd' | 'beda' | 'seimbang' | 'rincian' | 'namaSubkegiatan'>
>;

export type Operasi =
  | { jenis: 'tambah'; kunci: string; data: DataBaru }
  | { jenis: 'ubah'; kunci: string; id: string; set: Perubahan }
  | { jenis: 'tandai_hilang'; kunci: string; id: string };

export type AturanTemuan = 'R1' | 'R2' | 'R7' | 'R8';

export interface Temuan {
  aturan: AturanTemuan;
  kunci: string;
  id?: string;
  sebelum?: unknown;
  sesudah?: unknown;
}

export interface HasilBanding {
  operasi: Operasi[];
  temuan: Temuan[];
}

export const kunciSubkegiatan = (subUnitId: string, kodeSubkegiatan: string) => `${subUnitId}|${kodeSubkegiatan}`;

/** Urutkan alokasi berdasarkan sumber dana dan buang nilai nol, agar perbandingan deterministik. */
export function urutkan<T extends { sumberDanaId: string; nilai: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => (a.sumberDanaId < b.sumberDanaId ? -1 : a.sumberDanaId > b.sumberDanaId ? 1 : 0));
}

export function komposisi(xs: { sumberDanaId: string; nilai: number }[]): string {
  return urutkan(xs.filter((a) => a.nilai !== 0))
    .map((a) => `${a.sumberDanaId}:${a.nilai}`)
    .join('|');
}

export function himpunanSumberDana(xs: { sumberDanaId: string; nilai: number }[]): string {
  return [...new Set(xs.filter((a) => a.nilai !== 0).map((a) => a.sumberDanaId))].sort().join('|');
}

/** FNV-1a 32-bit atas komposisi sumber dana SIPD; cukup untuk mendeteksi perubahan komposisi. */
export function hashKomposisi(xs: AlokasiSipd[]): string {
  const s = komposisi(xs);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + ':' + s.length.toString(36);
}

export const totalAlokasi = (xs: { nilai: number }[]) => xs.reduce((a, b) => a + b.nilai, 0);

/** Bentuk kanonik (urutan key tetap, field kosong dibuang) agar perbandingan tidak bergantung urutan baris file. */
function urutkanRincian(rs: Rincian[]): Rincian[] {
  const k = (r: Rincian) => `${r.kodeRekening}|${r.kodeSumberDana}|${r.paket ?? ''}|${r.namaPaket ?? ''}|${r.pagu}`;
  return [...rs]
    .sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0))
    .map((r) => {
      const o: Rincian = { kodeRekening: r.kodeRekening, kodeSumberDana: r.kodeSumberDana, pagu: r.pagu };
      if (r.paket) o.paket = r.paket;
      if (r.namaPaket) o.namaPaket = r.namaPaket;
      return o;
    });
}

const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalBeda = (b: Beda): Beda => {
  const o: Beda = { ada: !!b.ada };
  if (b.hashSipd) o.hashSipd = b.hashSipd;
  if (b.diputuskan) o.diputuskan = b.diputuskan;
  if (b.oleh) o.oleh = String(b.oleh);
  if (b.pada) o.pada = b.pada;
  return o;
};
const normalAlokasi = (xs: AlokasiTersimpan[]) =>
  xs.map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai, nilaiSipd: a.nilaiSipd ?? 0, asal: a.asal }));

/**
 * Banding tersimpan vs SIPD. Dengan abaikanSumberDana hanya pagu (dan nama/status) yang diambil dari SIPD:
 * alokasi sumber dana tersimpan tidak disentuh dan tidak dibandingkan (tidak ada R2), subkegiatan baru masuk
 * tanpa sumber dana, dan "seimbang" dihitung ulang terhadap pagu baru.
 */
export function banding(tersimpan: Map<string, Tersimpan>, sipd: Map<string, DataSipd>, opsi: { abaikanSumberDana?: boolean } = {}): HasilBanding {
  const abaikanSd = !!opsi.abaikanSumberDana;
  const operasi: Operasi[] = [];
  const temuan: Temuan[] = [];
  const kunciSemua = [...new Set([...tersimpan.keys(), ...sipd.keys()])].sort();

  for (const kunci of kunciSemua) {
    const t = tersimpan.get(kunci);
    const s = sipd.get(kunci);

    if (!t && s) {
      // R7: subkegiatan baru, alokasi ikut SIPD
      const alokasiSipd = abaikanSd ? [] : urutkan(s.alokasi);
      const alokasi = alokasiSipd.map((a) => ({ ...a, nilaiSipd: a.nilai, asal: 'sipd' as const }));
      operasi.push({
        jenis: 'tambah',
        kunci,
        data: {
          skpdId: s.skpdId,
          subUnitId: s.subUnitId,
          kodeSubkegiatan: s.kodeSubkegiatan,
          namaSubkegiatan: s.namaSubkegiatan,
          pagu: s.pagu,
          status: 'aktif',
          alokasi,
          alokasiSipd,
          beda: { ada: false },
          seimbang: totalAlokasi(alokasi) === s.pagu,
          rincian: urutkanRincian(s.rincian),
        },
      });
      temuan.push({ aturan: 'R7', kunci, sesudah: { pagu: s.pagu, alokasi: alokasiSipd } });
      continue;
    }
    if (!t) continue;

    if (!s) {
      // R8: ada di tahapan, tidak ada di impor terakhir
      if (t.status !== 'tidak_ada_di_impor') {
        operasi.push({ jenis: 'tandai_hilang', kunci, id: t.id });
        temuan.push({ aturan: 'R8', kunci, id: t.id, sebelum: { pagu: t.pagu } });
      }
      continue;
    }

    const set: Perubahan = {};
    if (t.status === 'tidak_ada_di_impor') set.status = 'aktif';
    if (s.namaSubkegiatan && s.namaSubkegiatan !== t.namaSubkegiatan) set.namaSubkegiatan = s.namaSubkegiatan;

    if (t.pagu !== s.pagu) {
      set.pagu = s.pagu;
      temuan.push({ aturan: 'R1', kunci, id: t.id, sebelum: { pagu: t.pagu }, sesudah: { pagu: s.pagu } });
    }

    if (abaikanSd) {
      // hanya pagu: alokasi, nilai SIPD, dan keputusan perbedaan tetap seperti tersimpan
      const rincianKosong = urutkanRincian(s.rincian);
      if (!sama(rincianKosong, urutkanRincian(t.rincian ?? []))) set.rincian = rincianKosong;
      const seimbangPagu = totalAlokasi(normalAlokasi(t.alokasi)) === (set.pagu ?? t.pagu);
      if (seimbangPagu !== t.seimbang) set.seimbang = seimbangPagu;
      if (Object.keys(set).length) operasi.push({ jenis: 'ubah', kunci, id: t.id, set });
      continue;
    }

    const alokasiSipd = urutkan(s.alokasi);
    const hash = hashKomposisi(alokasiSipd);
    const nilaiSipdPer = new Map(alokasiSipd.map((a) => [a.sumberDanaId, a.nilai]));
    const lama = normalAlokasi(t.alokasi);

    // selalu simpan nilai SIPD terbaru di samping nilai
    let alokasiBaru: AlokasiTersimpan[] = lama.map((a) => ({ ...a, nilaiSipd: nilaiSipdPer.get(a.sumberDanaId) ?? 0 }));
    let bedaBaru: Beda = normalBeda(t.beda ?? { ada: false });

    const samaSet = himpunanSumberDana(lama) === himpunanSumberDana(alokasiSipd);
    const semuaAsalSipd = lama.every((a) => a.asal === 'sipd');

    if (samaSet && semuaAsalSipd) {
      // R1: nilai ikut SIPD otomatis
      alokasiBaru = alokasiSipd.map((a) => ({ sumberDanaId: a.sumberDanaId, nilai: a.nilai, nilaiSipd: a.nilai, asal: 'sipd' }));
      if (komposisi(lama) !== komposisi(alokasiBaru)) {
        temuan.push({ aturan: 'R1', kunci, id: t.id, sebelum: { alokasi: lama }, sesudah: { alokasi: alokasiBaru } });
      }
      if (bedaBaru.ada) bedaBaru = { ada: false };
    } else if (komposisi(alokasiBaru) !== komposisi(alokasiSipd)) {
      const sudahDiputuskan = !!bedaBaru.diputuskan && bedaBaru.hashSipd === hash;
      const sudahTercatat = bedaBaru.ada && bedaBaru.hashSipd === hash;
      if (!sudahDiputuskan && !sudahTercatat) {
        // R2: masuk daftar perbedaan sumber dana
        bedaBaru = { ada: true, hashSipd: hash };
        temuan.push({ aturan: 'R2', kunci, id: t.id, sebelum: { alokasi: lama }, sesudah: { alokasi: alokasiSipd } });
      }
    } else if (bedaBaru.ada) {
      bedaBaru = { ...bedaBaru, ada: false };
    }

    if (!sama(alokasiBaru, lama)) set.alokasi = alokasiBaru;
    if (!sama(alokasiSipd, urutkan(t.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai }))))
      set.alokasiSipd = alokasiSipd;
    if (!sama(bedaBaru, normalBeda(t.beda ?? { ada: false }))) set.beda = bedaBaru;
    const rincianBaru = urutkanRincian(s.rincian);
    if (!sama(rincianBaru, urutkanRincian(t.rincian ?? []))) set.rincian = rincianBaru;
    const seimbang = totalAlokasi(alokasiBaru) === (set.pagu ?? t.pagu);
    if (seimbang !== t.seimbang) set.seimbang = seimbang;

    if (Object.keys(set).length) operasi.push({ jenis: 'ubah', kunci, id: t.id, set });
  }

  return { operasi, temuan };
}

/** Efek aksi "Ikut SIPD" (Bagian 8): alokasi = komposisi SIPD, sumber dana yang tidak ada di SIPD dihapus. */
export function ikutSipd(t: Pick<Tersimpan, 'alokasiSipd' | 'pagu'>): { alokasi: AlokasiTersimpan[]; seimbang: boolean; hash: string } {
  const alokasiSipd = urutkan(t.alokasiSipd);
  const alokasi = alokasiSipd.map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai, nilaiSipd: a.nilai, asal: 'sipd' as const }));
  return { alokasi, seimbang: totalAlokasi(alokasi) === t.pagu, hash: hashKomposisi(alokasiSipd) };
}

/** Efek "Edit Sendiri": baris yang nilainya berbeda dari SIPD diberi asal admin. */
export function terapkanEditAdmin(
  input: AlokasiSipd[],
  alokasiSipd: AlokasiSipd[],
  pagu: number,
): { alokasi: AlokasiTersimpan[]; seimbang: boolean; hash: string } {
  const sipdPer = new Map(alokasiSipd.map((a) => [String(a.sumberDanaId), a.nilai]));
  const alokasi = urutkan(input).map((a) => {
    const nilaiSipd = sipdPer.get(a.sumberDanaId) ?? 0;
    return { sumberDanaId: a.sumberDanaId, nilai: a.nilai, nilaiSipd, asal: (a.nilai === nilaiSipd && sipdPer.has(a.sumberDanaId) ? 'sipd' : 'admin') as Asal };
  });
  return { alokasi, seimbang: totalAlokasi(alokasi) === pagu, hash: hashKomposisi(urutkan(alokasiSipd)) };
}
