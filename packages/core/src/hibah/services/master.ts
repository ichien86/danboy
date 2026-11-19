import type { Model } from 'mongoose';
import {
  bacaFile, hapusFile, HibahBerkasWajib, HibahChecklist, HibahJenisPenerima, HibahRekening, HibahSusunan, HibahTemplat,
  HibahTujuanBansos, oid, Rekening, sambung, simpanFile, WilayahDesa, WilayahKecamatan, type HibahChecklistDoc, type HibahTemplatDoc,
} from '@danboy/db';
import { skemaMasterHibah, type JenisMasterHibah } from '@danboy/schema';
import { isiTemplat, periksaTemplat, templatBawaan, type JenisTemplat } from '@danboy/cetak';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { escapeRegex } from '../../services/umum';
import { petaNamaPd, pastikanIdHibah, ser } from './umum';

const MODEL: Record<JenisMasterHibah, Model<any>> = {
  'jenis-penerima': HibahJenisPenerima,
  checklist: HibahChecklist,
  'berkas-wajib': HibahBerkasWajib,
  'tujuan-bansos': HibahTujuanBansos,
  rekening: HibahRekening,
  susunan: HibahSusunan,
  kecamatan: WilayahKecamatan,
  desa: WilayahDesa,
};
const URUT: Record<JenisMasterHibah, Record<string, 1 | -1>> = {
  'jenis-penerima': { kelompok: -1, urutan: 1, kode: 1 },
  checklist: { jenisPenerimaKode: 1, urutan: 1 },
  'berkas-wajib': { jenisPenerimaKode: 1, kode: 1 },
  'tujuan-bansos': { kode: 1 },
  rekening: { kodeRekening: 1 },
  susunan: { tahun: -1, urutan: 1 },
  kecamatan: { nama: 1 },
  desa: { kecamatanKode: 1, nama: 1 },
};

export async function daftarMasterHibah(user: SessionUser, jenis: JenisMasterHibah, f: { q?: string; kecamatan?: string; tahun?: number } = {}) {
  // wilayah dibaca semua peran modul (pilihan alamat penerima); master lain hanya Admin Perencana
  pastikanBolehHibah(user, jenis === 'kecamatan' || jenis === 'desa' ? 'hibah_lihat_rekap' : 'hibah_kelola_master');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (f.q) filter.$or = ['kode', 'nama', 'pertanyaan', 'kodeRekening'].map((k) => ({ [k]: { $regex: escapeRegex(f.q!), $options: 'i' } }));
  if (jenis === 'desa' && f.kecamatan) filter.kecamatanKode = f.kecamatan;
  if (jenis === 'susunan' && f.tahun) filter.tahun = f.tahun;
  return ser(await MODEL[jenis].find(filter).sort(URUT[jenis]).limit(3000).lean());
}

/** Tambah (id kosong) atau ubah butir master. Butir checklist yang berubah pertanyaannya naik versi (FR-05). */
export async function simpanMasterHibah(user: SessionUser, jenis: JenisMasterHibah, id: string | null, input: unknown) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const data = skemaMasterHibah[jenis].parse(input) as Record<string, unknown>;
  const M = MODEL[jenis];
  if (jenis === 'desa' && !(await WilayahKecamatan.exists({ kode: data.kecamatanKode }))) throw new Galat('VALIDASI', 'Kecamatan tidak dikenal', { kecamatanKode: 'Tidak dikenal' });
  try {
    if (!id) return ser((await M.create(data)).toObject());
    const _id = oid(pastikanIdHibah(id));
    if (jenis === 'checklist') {
      const lama = await HibahChecklist.findById(_id).lean<HibahChecklistDoc>();
      if (lama && (lama.pertanyaan !== data.pertanyaan || lama.dasar !== data.dasar)) data.versi = (lama.versi ?? 1) + 1;
    }
    const d = await M.findOneAndUpdate({ _id }, { $set: data }, { new: true }).lean();
    if (!d) throw tidakDitemukan('Data');
    return ser(d);
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new Galat('VALIDASI', 'Kode sudah dipakai', { kode: 'Sudah dipakai' });
    throw e;
  }
}

/** Pilihan untuk formulir usulan dan penerima (semua peran modul). */
export async function opsiHibah(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const [jenis, tujuan, rekening, kecamatan, desa] = await Promise.all([
    HibahJenisPenerima.find({ aktif: true }).sort(URUT['jenis-penerima']).lean(),
    HibahTujuanBansos.find({ aktif: true }).sort({ kode: 1 }).lean(),
    HibahRekening.find({ aktif: true }).sort({ kodeRekening: 1 }).lean(),
    WilayahKecamatan.find({ aktif: true }).sort({ nama: 1 }).lean(),
    WilayahDesa.find({ aktif: true }).sort({ nama: 1 }).lean(),
  ]);
  return ser({ jenis, tujuan, rekening, kecamatan, desa });
}

/** Daftarkan semua rekening DANBOY berawalan 5.1.05 (hibah) dan 5.1.06 (bansos) yang belum ada. */
export async function tarikRekeningDanboy(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const r = await Rekening.find({ kode: { $regex: '^5\\.1\\.0[56]' } }).lean();
  let baru = 0;
  for (const x of r) {
    const h = await HibahRekening.updateOne({ kodeRekening: x.kode }, { $setOnInsert: { kodeRekening: x.kode, nama: x.nama, jenisPenerimaKode: [], aktif: true } }, { upsert: true });
    baru += h.upsertedCount;
  }
  return { ditemukan: r.length, baru };
}

/* ---------- Templat dokumen ---------- */

const CONTOH: Record<JenisTemplat, Record<string, unknown>> = {
  rekomendasi: {
    nomor: '400/001/2026', tanggal: '19 November 2026', perihal: 'Rekomendasi', tahun: 2027, namaPd: 'Dinas Contoh', namaPdKapital: 'DINAS CONTOH',
    alamatKop: 'Jl. Contoh No. 1 Boyolali', kepalaPdNama: 'Nama Kepala', kepalaPdNip: '19700101 199001 1 001', totalUsulan: '1.000.000', totalRekomendasi: '1.000.000',
    usulan: [{ no: 1, nama: 'Penerima', alamat: 'Alamat', jenis: 'Individu', bentuk: 'Uang', subkegiatan: '1.01.01.2.01.0001', nilaiUsulan: '1.000.000', nilaiRekomendasi: '1.000.000' }],
    lampiran: [],
  },
  berita_acara: { nomor: '001/BA/TAPD/2026', tanggal: '19 November 2026', hariTanggal: 'Kamis, 19 November 2026', tahun: 2027, alamatKop: '', dasarHukum: [], rekap: [], tapd: [], totalDisetujui: '0', totalDisetujuiTerbilang: 'nol rupiah' },
  lampiran: { judul: 'LAMPIRAN I', tahun: 2027, nomorBa: '001', baris: [], totalRekomendasi: '0', totalDisetujui: '0' },
};

export async function daftarTemplat(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_kelola_templat_pd');
  await sambung();
  const filter: Record<string, unknown> = { aktif: true };
  // Operator PD hanya melihat templat kop PD-nya sendiri
  if (peranHibah(user) === 'operator_pd') Object.assign(filter, { jenis: 'rekomendasi', skpdId: oid(user.skpdId) });
  const d = await HibahTemplat.find(filter).sort({ jenis: 1, createdAt: -1 }).lean<HibahTemplatDoc[]>();
  const nama = await petaNamaPd(d.filter((t) => t.skpdId).map((t) => t.skpdId));
  return ser(d.map((t) => ({ ...t, namaPd: t.skpdId ? (nama.get(String(t.skpdId)) ?? '') : 'Bawaan' })));
}

/** Unggah templat .docx; diperiksa dulu (penanda wajib, bisa diisi data contoh). Versi lama dinonaktifkan, tidak dihapus. */
export async function unggahTemplat(user: SessionUser, input: { jenis: JenisTemplat; skpdId?: string | null; nama: string; isi: Buffer }) {
  pastikanBolehHibah(user, 'hibah_kelola_templat_pd');
  const ap = bolehHibah(user, 'hibah_kelola_master');
  // Operator PD hanya boleh mengunggah kop rekomendasi PD-nya; Admin Perencana semua jenis
  const skpdId = ap ? (input.jenis === 'rekomendasi' ? input.skpdId || null : null) : user.skpdId;
  if (!ap && input.jenis !== 'rekomendasi') throw new Galat('TIDAK_BERHAK', 'Operator PD hanya mengunggah templat dokumen rekomendasi');
  if (!input.nama.toLowerCase().endsWith('.docx')) throw new Galat('FORMAT_FILE', 'Templat harus berkas .docx');
  if (input.isi.length > 2 * 1024 * 1024) throw new Galat('FILE_TERLALU_BESAR', 'Templat maksimal 2 MB');
  const galat = periksaTemplat(input.isi, input.jenis, CONTOH[input.jenis]);
  if (galat.length) throw new Galat('FORMAT_FILE', `Templat belum sesuai: ${galat[0]}`, { daftar: galat });
  await sambung();
  const filter = { jenis: input.jenis, skpdId: skpdId ? oid(skpdId) : null, aktif: true };
  const lama = await HibahTemplat.findOne(filter).sort({ versi: -1 }).lean<HibahTemplatDoc>();
  const gridfsId = await simpanFile(input.nama, input.isi, { jenis: 'templat_hibah' });
  if (lama) await HibahTemplat.findOneAndUpdate({ _id: lama._id }, { $set: { aktif: false } });
  const d = await HibahTemplat.create({ ...filter, gridfsId, nama: input.nama, versi: (lama?.versi ?? 0) + 1, diunggahOleh: oid(user.id) });
  return ser(d.toObject());
}

export async function nonaktifkanTemplat(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_kelola_templat_pd');
  await sambung();
  const t = await HibahTemplat.findById(pastikanIdHibah(id, 'Templat')).lean<HibahTemplatDoc>();
  if (!t) throw tidakDitemukan('Templat');
  if (!bolehHibah(user, 'hibah_kelola_master') && String(t.skpdId) !== user.skpdId) throw tidakDitemukan('Templat');
  await HibahTemplat.findOneAndUpdate({ _id: t._id }, { $set: { aktif: false } });
  return { ok: true };
}

/** Isi templat aktif (PD dulu, lalu bawaan unggahan Admin Perencana, lalu bawaan sistem). */
export async function ambilTemplat(jenis: JenisTemplat, skpdId?: string | null): Promise<{ isi: Buffer; sumber: 'pd' | 'unggahan' | 'bawaan' }> {
  await sambung();
  if (skpdId) {
    const t = await HibahTemplat.findOne({ jenis, skpdId: oid(skpdId), aktif: true }).sort({ versi: -1 }).lean<HibahTemplatDoc>();
    if (t) return { isi: await bacaFile(t.gridfsId), sumber: 'pd' };
  }
  const u = await HibahTemplat.findOne({ jenis, skpdId: null, aktif: true }).sort({ versi: -1 }).lean<HibahTemplatDoc>();
  if (u) return { isi: await bacaFile(u.gridfsId), sumber: 'unggahan' };
  return { isi: templatBawaan(jenis), sumber: 'bawaan' };
}

/** Unduh templat (yang aktif atau bawaan) sebagai titik awal membuat templat berkop sendiri. */
export async function unduhTemplat(user: SessionUser, jenis: JenisTemplat, bawaan = false) {
  pastikanBolehHibah(user, 'hibah_kelola_templat_pd');
  const t = bawaan ? { isi: templatBawaan(jenis) } : await ambilTemplat(jenis, peranHibah(user) === 'operator_pd' ? user.skpdId : null);
  return { namaFile: `templat-${jenis.replace('_', '-')}.docx`, isi: t.isi };
}

/** Contoh hasil pengisian templat (untuk pratinjau setelah unggah). */
export const contohTemplat = (jenis: JenisTemplat, isi: Buffer) => isiTemplat(isi, CONTOH[jenis]);
export { hapusFile };
