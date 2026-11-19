import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { auditPlugin } from './audit';

type Id = Types.ObjectId;

function buat<T>(nama: string, schema: Schema<T>, koleksi: string): Model<T> {
  return (mongoose.models[nama] as Model<T>) || mongoose.model<T>(nama, schema, koleksi);
}
const opsi = { versionKey: false as const, timestamps: true };
const aud = (s: Schema, koleksi: string) => s.plugin(auditPlugin, { koleksi });

/* ---------- 4.1 Master dan akun ---------- */

export interface SkpdDoc { _id: Id; kode: string; nama: string; aktif: boolean; createdAt: Date; updatedAt: Date }
const skpdSchema = new Schema<SkpdDoc>(
  { kode: { type: String, required: true, unique: true }, nama: { type: String, required: true }, aktif: { type: Boolean, default: true } },
  opsi,
);
aud(skpdSchema, 'skpd');
export const Skpd = buat('Skpd', skpdSchema, 'skpd');

export interface SubUnitDoc { _id: Id; kode: string; nama: string; skpdId: Id; aktif: boolean; createdAt: Date; updatedAt: Date }
const subUnitSchema = new Schema<SubUnitDoc>(
  {
    kode: { type: String, required: true, unique: true },
    nama: { type: String, required: true },
    skpdId: { type: Schema.Types.ObjectId, ref: 'Skpd', required: true, index: true },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
aud(subUnitSchema, 'subUnit');
export const SubUnit = buat('SubUnit', subUnitSchema, 'subUnit');

export type Peran = 'super_admin' | 'admin' | 'skpd';
export type AksesHibah = 'admin_perencana' | 'verifikator' | 'anggota';
export interface UserDoc {
  /** peran null = akun tanpa akses DANBOY; aksesHibah = peran di modul Hibah dan Bansos (akun SKPD otomatis Operator PD). */
  _id: Id; username: string; nama: string; passwordHash: string; peran: Peran | null; skpdId?: Id | null;
  aksesHibah?: AksesHibah | null;
  wajibGantiSandi: boolean; gagalLogin: number; terkunciSampai?: Date | null; totpSecret?: string;
  aktif: boolean; createdAt: Date; updatedAt: Date;
}
const userSchema = new Schema<UserDoc>(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nama: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    peran: { type: String, enum: ['super_admin', 'admin', 'skpd', null], default: null },
    aksesHibah: { type: String, enum: ['admin_perencana', 'verifikator', 'anggota', null], default: null },
    skpdId: { type: Schema.Types.ObjectId, ref: 'Skpd', default: null },
    wajibGantiSandi: { type: Boolean, default: true },
    gagalLogin: { type: Number, default: 0 },
    terkunciSampai: { type: Date, default: null },
    totpSecret: { type: String, select: false },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
aud(userSchema, 'user');
export const User = buat('User', userSchema, 'user');

export type JenisNomenklatur = 'urusan' | 'bidang' | 'program' | 'kegiatan' | 'subkegiatan';
export interface NomenklaturDoc { _id: Id; versi: string; jenis: JenisNomenklatur; kode: string; nama: string; indukKode?: string; aktif: boolean }
const nomenklaturSchema = new Schema<NomenklaturDoc>(
  {
    versi: { type: String, required: true },
    jenis: { type: String, enum: ['urusan', 'bidang', 'program', 'kegiatan', 'subkegiatan'], required: true },
    kode: { type: String, required: true },
    nama: { type: String, required: true },
    indukKode: String,
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
nomenklaturSchema.index({ versi: 1, kode: 1 }, { unique: true });
nomenklaturSchema.index({ kode: 1, aktif: 1 });
nomenklaturSchema.index({ indukKode: 1 });
nomenklaturSchema.index({ nama: 'text', kode: 'text' });
aud(nomenklaturSchema, 'nomenklatur');
export const Nomenklatur = buat('Nomenklatur', nomenklaturSchema, 'nomenklatur');

export interface RekeningDoc { _id: Id; kode: string; nama: string }
const rekeningSchema = new Schema<RekeningDoc>(
  { kode: { type: String, required: true, unique: true }, nama: { type: String, required: true } },
  opsi,
);
rekeningSchema.index({ nama: 'text', kode: 'text' });
aud(rekeningSchema, 'rekening');
export const Rekening = buat('Rekening', rekeningSchema, 'rekening');

export interface SumberDanaDoc {
  _id: Id; kode: string; nama: string; indukKode?: string; khusus: boolean; namaTagging?: string | null; aktif: boolean;
  createdAt: Date; updatedAt: Date;
}
const sumberDanaSchema = new Schema<SumberDanaDoc>(
  {
    kode: { type: String, required: true, unique: true },
    nama: { type: String, required: true },
    indukKode: String,
    khusus: { type: Boolean, default: false },
    namaTagging: { type: String, default: null, index: true },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
aud(sumberDanaSchema, 'sumberDana');
export const SumberDana = buat('SumberDana', sumberDanaSchema, 'sumberDana');

export interface TaggingDoc {
  _id: Id; tahun: number; sumberDanaId: Id; kodeSubkegiatan: string; kategori: string; rincian: string;
  kinerja?: string; indikator?: string; satuan?: string; diubahOleh?: Id; updatedAt: Date; createdAt: Date;
}
const taggingSchema = new Schema<TaggingDoc>(
  {
    tahun: { type: Number, required: true },
    sumberDanaId: { type: Schema.Types.ObjectId, ref: 'SumberDana', required: true },
    kodeSubkegiatan: { type: String, required: true },
    kategori: { type: String, default: '' },
    rincian: { type: String, default: '' },
    kinerja: String,
    indikator: String,
    satuan: String,
    diubahOleh: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opsi,
);
taggingSchema.index({ tahun: 1, sumberDanaId: 1, kodeSubkegiatan: 1, rincian: 1 }, { unique: true });
taggingSchema.index({ tahun: 1, kodeSubkegiatan: 1 });
aud(taggingSchema, 'tagging');
export const Tagging = buat('Tagging', taggingSchema, 'tagging');

/* ---------- 4.2 Tahapan dan anggaran ---------- */

export interface TahunAnggaranDoc { _id: Id; tahun: number; status: 'aktif' | 'arsip' }
const tahunSchema = new Schema<TahunAnggaranDoc>(
  { tahun: { type: Number, required: true, unique: true }, status: { type: String, enum: ['aktif', 'arsip'], default: 'aktif' } },
  opsi,
);
aud(tahunSchema, 'tahunAnggaran');
export const TahunAnggaran = buat('TahunAnggaran', tahunSchema, 'tahunAnggaran');

export type JenisTahapan = 'KUA_PPAS' | 'RAPBD' | 'APBD' | 'PERGESERAN' | 'PERUBAHAN';
export type StatusTahapan = 'draf' | 'terbuka' | 'ditutup';
export interface TahapanDoc {
  _id: Id; tahun: number; jenis: JenisTahapan; ke: number; nama: string; urutan: number;
  jadwalMulai: Date; jadwalSelesai: Date; status: StatusTahapan;
  disalinDari?: Id | null; disalinPada?: Date | null; galatSalin?: string | null; ditutupPada?: Date | null;
  createdAt: Date; updatedAt: Date;
}
const tahapanSchema = new Schema<TahapanDoc>(
  {
    tahun: { type: Number, required: true },
    jenis: { type: String, enum: ['KUA_PPAS', 'RAPBD', 'APBD', 'PERGESERAN', 'PERUBAHAN'], required: true },
    ke: { type: Number, default: 1 },
    nama: { type: String, required: true },
    urutan: { type: Number, required: true },
    jadwalMulai: { type: Date, required: true },
    jadwalSelesai: { type: Date, required: true },
    status: { type: String, enum: ['draf', 'terbuka', 'ditutup'], default: 'draf' },
    disalinDari: { type: Schema.Types.ObjectId, ref: 'Tahapan', default: null },
    disalinPada: { type: Date, default: null },
    galatSalin: { type: String, default: null },
    ditutupPada: { type: Date, default: null },
  },
  opsi,
);
tahapanSchema.index({ tahun: 1, jenis: 1, ke: 1 }, { unique: true });
tahapanSchema.index({ status: 1, jadwalMulai: 1 });
aud(tahapanSchema, 'tahapan');
/**
 * Cache singkat dokumen tahapan per proses (dibaca berkali-kali dalam satu permintaan: kerangka, halaman, layanan).
 * Dikosongkan setiap kali ada penulisan ke koleksi tahapan; pemeriksaan "tahapan terbuka" sebelum mengubah data
 * tidak memakai cache ini.
 */
export const cacheTahapan = new Map<string, { doc: unknown; waktu: number }>();
for (const op of ['save', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'insertMany'] as const)
  tahapanSchema.post(op as 'save', () => cacheTahapan.clear());
export const Tahapan = buat('Tahapan', tahapanSchema, 'tahapan');

export interface PaguSumberDanaDoc { _id: Id; tahapanId: Id; sumberDanaId: Id; nilai: number; diubahOleh?: Id; updatedAt: Date; createdAt: Date }
const paguSchema = new Schema<PaguSumberDanaDoc>(
  {
    tahapanId: { type: Schema.Types.ObjectId, ref: 'Tahapan', required: true },
    sumberDanaId: { type: Schema.Types.ObjectId, ref: 'SumberDana', required: true },
    nilai: { type: Number, required: true, min: 0, validate: Number.isInteger },
    diubahOleh: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  opsi,
);
paguSchema.index({ tahapanId: 1, sumberDanaId: 1 }, { unique: true });
aud(paguSchema, 'paguSumberDana');
export const PaguSumberDana = buat('PaguSumberDana', paguSchema, 'paguSumberDana');

export interface AlokasiDoc { sumberDanaId: Id; nilai: number; nilaiSipd: number; asal: 'sipd' | 'admin' }
export interface BedaDoc { ada: boolean; hashSipd?: string; diputuskan?: 'ikut_sipd' | 'edit_sendiri'; oleh?: Id; pada?: Date }
export interface RincianDoc { kodeRekening: string; kodeSumberDana: string; paket?: string; namaPaket?: string; pagu: number }
export interface SubkegiatanTahapanDoc {
  _id: Id; tahapanId: Id; skpdId: Id; subUnitId: Id; kodeSubkegiatan: string; namaSubkegiatan: string; pagu: number;
  status: 'aktif' | 'tidak_ada_di_impor';
  alokasi: AlokasiDoc[];
  alokasiSipd: { sumberDanaId: Id; nilai: number }[];
  beda: BedaDoc;
  seimbang: boolean;
  rincian: RincianDoc[];
  imporTerakhirId?: Id | null;
  createdAt: Date; updatedAt: Date;
}
const bulat = { type: Number, required: true, min: 0, validate: Number.isInteger };
const subkegiatanSchema = new Schema<SubkegiatanTahapanDoc>(
  {
    tahapanId: { type: Schema.Types.ObjectId, ref: 'Tahapan', required: true },
    skpdId: { type: Schema.Types.ObjectId, ref: 'Skpd', required: true },
    subUnitId: { type: Schema.Types.ObjectId, ref: 'SubUnit', required: true },
    kodeSubkegiatan: { type: String, required: true },
    namaSubkegiatan: { type: String, default: '' },
    pagu: bulat,
    status: { type: String, enum: ['aktif', 'tidak_ada_di_impor'], default: 'aktif' },
    alokasi: [
      new Schema(
        {
          sumberDanaId: { type: Schema.Types.ObjectId, ref: 'SumberDana', required: true },
          nilai: bulat,
          nilaiSipd: { type: Number, default: 0 },
          asal: { type: String, enum: ['sipd', 'admin'], default: 'sipd' },
        },
        { _id: false },
      ),
    ],
    alokasiSipd: [new Schema({ sumberDanaId: { type: Schema.Types.ObjectId, ref: 'SumberDana' }, nilai: Number }, { _id: false })],
    beda: {
      ada: { type: Boolean, default: false },
      hashSipd: String,
      diputuskan: { type: String, enum: ['ikut_sipd', 'edit_sendiri'] },
      oleh: { type: Schema.Types.ObjectId, ref: 'User' },
      pada: Date,
    },
    seimbang: { type: Boolean, default: true },
    rincian: [
      new Schema(
        { kodeRekening: String, kodeSumberDana: String, paket: String, namaPaket: String, pagu: Number },
        { _id: false },
      ),
    ],
    imporTerakhirId: { type: Schema.Types.ObjectId, ref: 'ImporBatch', default: null },
  },
  { ...opsi, minimize: false },
);
subkegiatanSchema.index({ tahapanId: 1, subUnitId: 1, kodeSubkegiatan: 1 }, { unique: true });
subkegiatanSchema.index({ tahapanId: 1, skpdId: 1 });
subkegiatanSchema.index({ tahapanId: 1, 'alokasi.sumberDanaId': 1 });
subkegiatanSchema.index({ tahapanId: 1, 'beda.ada': 1 });
subkegiatanSchema.index({ tahapanId: 1, kodeSubkegiatan: 1 });
aud(subkegiatanSchema, 'subkegiatanTahapan');
export const SubkegiatanTahapan = buat('SubkegiatanTahapan', subkegiatanSchema, 'subkegiatanTahapan');

/* ---------- 4.3 Impor, notifikasi, audit ---------- */

export type JenisImpor = 'apbd' | 'nomenklatur' | 'sumber_dana' | 'rekening' | 'tagging' | 'verifikasi' | 'skpd';
export type StatusBatch = 'diunggah' | 'diproses' | 'pratinjau' | 'diterapkan' | 'dibatalkan' | 'gagal' | 'selesai';
export interface ImporBatchDoc {
  _id: Id; tahapanId?: Id | null; tahun?: number | null; jenis: JenisImpor; namaFile: string; hashFile: string;
  fileId: Id; ukuran: number; status: StatusBatch; progres: number; ringkasan: Record<string, unknown>;
  galat?: string | null; olehId: Id; createdAt: Date; updatedAt: Date; diterapkanPada?: Date | null;
  /** Pilihan saat unggah. abaikanSumberDana: impor APBD hanya mengambil pagu per subkegiatan. */
  opsi?: { abaikanSumberDana?: boolean };
  /** Judul proses (verifikasi SIPD); tampil menggantikan nama file. */
  judul?: string | null;
}
const batchSchema = new Schema<ImporBatchDoc>(
  {
    tahapanId: { type: Schema.Types.ObjectId, ref: 'Tahapan', default: null },
    tahun: { type: Number, default: null },
    jenis: { type: String, enum: ['apbd', 'nomenklatur', 'sumber_dana', 'rekening', 'tagging', 'verifikasi', 'skpd'], required: true },
    namaFile: { type: String, required: true },
    hashFile: { type: String, required: true },
    fileId: { type: Schema.Types.ObjectId, required: true },
    ukuran: { type: Number, default: 0 },
    status: { type: String, enum: ['diunggah', 'diproses', 'pratinjau', 'diterapkan', 'dibatalkan', 'gagal', 'selesai'], default: 'diunggah' },
    progres: { type: Number, default: 0 },
    ringkasan: { type: Schema.Types.Mixed, default: {} },
    galat: { type: String, default: null },
    olehId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    diterapkanPada: { type: Date, default: null },
    opsi: { abaikanSumberDana: { type: Boolean, default: false } },
    judul: { type: String, default: null },
  },
  { ...opsi, minimize: false },
);
batchSchema.index({ tahapanId: 1, status: 1 });
batchSchema.index({ jenis: 1, createdAt: -1 });
export const ImporBatch = buat('ImporBatch', batchSchema, 'imporBatch');

export interface ImporBarisDoc { _id: Id; batchId: Id; noBaris: number; data: Record<string, unknown>; status: 'ok' | 'ditahan'; alasan?: string }
const barisSchema = new Schema<ImporBarisDoc>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'ImporBatch', required: true },
    noBaris: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['ok', 'ditahan'], default: 'ok' },
    alasan: String,
  },
  { versionKey: false, minimize: false },
);
barisSchema.index({ batchId: 1, noBaris: 1 }, { unique: true });
barisSchema.index({ batchId: 1, status: 1 });
export const ImporBaris = buat('ImporBaris', barisSchema, 'imporBaris');

export interface HasilBandingDoc {
  _id: Id; batchId: Id; kunci: string; aturan: string; sebelum?: unknown; sesudah?: unknown;
  operasi?: Record<string, unknown> | null; skpdId?: Id; kodeSubkegiatan?: string; namaSubkegiatan?: string;
  verifikasi?: Record<string, unknown> | null;
  /** Pengingat tindak lanjut SKPD: sudah disesuaikan di SIPD (tidak mengubah data anggaran). */
  tindakLanjut?: { selesai: boolean; oleh?: Id | null; pada?: Date | null } | null;
}
const hasilSchema = new Schema<HasilBandingDoc>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'ImporBatch', required: true },
    kunci: { type: String, required: true },
    aturan: { type: String, required: true },
    sebelum: Schema.Types.Mixed,
    sesudah: Schema.Types.Mixed,
    operasi: { type: Schema.Types.Mixed, default: null },
    skpdId: { type: Schema.Types.ObjectId, ref: 'Skpd' },
    kodeSubkegiatan: String,
    namaSubkegiatan: String,
  },
  { versionKey: false, minimize: false },
);
hasilSchema.index({ batchId: 1, aturan: 1 });
hasilSchema.index({ batchId: 1, skpdId: 1, aturan: 1 });
// riwayat impor di rincian subkegiatan dicari menurut kunci (sub unit|kode subkegiatan)
hasilSchema.index({ kunci: 1, _id: -1 });
hasilSchema.add({
  verifikasi: { type: Schema.Types.Mixed, default: null },
  tindakLanjut: {
    selesai: { type: Boolean, default: false },
    oleh: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    pada: { type: Date, default: null },
  },
});
hasilSchema.index({ batchId: 1, skpdId: 1, 'tindakLanjut.selesai': 1 });
export const HasilBanding = buat('HasilBanding', hasilSchema, 'hasilBanding');

export type TingkatNotifikasi = 'info' | 'peringatan' | 'kritis';
export interface NotifikasiDoc {
  _id: Id; tahapanId?: Id | null; aturan: string; tingkat: TingkatNotifikasi; skpdId?: Id | null; subkegiatanTahapanId?: Id | null;
  sumberDanaId?: Id | null; batchId?: Id | null; pesan: string; detail?: Record<string, unknown>; tautan?: string;
  status: 'terbuka' | 'selesai' | 'diabaikan'; kunciUnik: string; alasanAbaikan?: string;
  createdAt: Date; updatedAt: Date; selesaiPada?: Date | null; selesaiOleh?: Id | null;
}
const notifikasiSchema = new Schema<NotifikasiDoc>(
  {
    tahapanId: { type: Schema.Types.ObjectId, ref: 'Tahapan', default: null },
    aturan: { type: String, required: true },
    tingkat: { type: String, enum: ['info', 'peringatan', 'kritis'], required: true },
    skpdId: { type: Schema.Types.ObjectId, ref: 'Skpd', default: null },
    subkegiatanTahapanId: { type: Schema.Types.ObjectId, ref: 'SubkegiatanTahapan', default: null },
    sumberDanaId: { type: Schema.Types.ObjectId, ref: 'SumberDana', default: null },
    batchId: { type: Schema.Types.ObjectId, ref: 'ImporBatch', default: null },
    pesan: { type: String, required: true },
    detail: { type: Schema.Types.Mixed, default: {} },
    tautan: String,
    status: { type: String, enum: ['terbuka', 'selesai', 'diabaikan'], default: 'terbuka' },
    kunciUnik: { type: String, required: true },
    alasanAbaikan: String,
    selesaiPada: { type: Date, default: null },
    selesaiOleh: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { ...opsi, minimize: false },
);
notifikasiSchema.index({ kunciUnik: 1 }, { unique: true, partialFilterExpression: { status: 'terbuka' } });
notifikasiSchema.index({ tahapanId: 1, status: 1, skpdId: 1 });
notifikasiSchema.index({ kunciUnik: 1, status: 1 });
// daftar notifikasi (terbaru dulu) dan hitung ulang sebagian per subkegiatan / per sumber dana
notifikasiSchema.index({ tahapanId: 1, status: 1, createdAt: -1 });
notifikasiSchema.index({ subkegiatanTahapanId: 1, status: 1 });
notifikasiSchema.index({ sumberDanaId: 1, status: 1 });
export const Notifikasi = buat('Notifikasi', notifikasiSchema, 'notifikasi');

export { LogAudit } from './audit';
export type { LogAuditDoc } from './audit';
