import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { auditPlugin } from './audit';

/* Model modul Hibah dan Bansos (TDD bagian Model Data). Semua koleksi berawalan hibah_ atau wilayah_. */

type Id = Types.ObjectId;
const buat = <T>(nama: string, schema: Schema<T>, koleksi: string): Model<T> =>
  (mongoose.models[nama] as Model<T>) || mongoose.model<T>(nama, schema, koleksi);
const opsi = { versionKey: false as const, timestamps: true };
const aud = (s: Schema, koleksi: string) => s.plugin(auditPlugin, { koleksi });
const ref = (model: string, wajib = false) => ({ type: Schema.Types.ObjectId, ref: model, ...(wajib ? { required: true } : { default: null }) });

export type TahapanHibah = 'input' | 'evaluasi' | 'verifikasi' | 'perbaikan' | 'penetapan';
export const TAHAPAN_HIBAH: TahapanHibah[] = ['input', 'evaluasi', 'verifikasi', 'perbaikan', 'penetapan'];
export type KelompokHibah = 'hibah' | 'bansos';
export type BentukHibah = 'uang' | 'barang';
export type JenisIdentitas = 'nik' | 'nik_kk' | 'badan_hukum' | 'lainnya';
export type StatusUsulan =
  | 'draf' | 'evaluasi' | 'layak' | 'tidak_layak' | 'dalam_rekomendasi' | 'rekomendasi_diunggah' | 'perbaikan' | 'disetujui' | 'ditolak';
export const STATUS_USULAN: StatusUsulan[] = [
  'draf', 'evaluasi', 'layak', 'tidak_layak', 'dalam_rekomendasi', 'rekomendasi_diunggah', 'perbaikan', 'disetujui', 'ditolak',
];

/* ---------- Pengaturan tahun dan jadwal ---------- */

export interface KunciPd { skpdId: Id; terkunci: boolean; oleh?: Id; waktu?: Date }
export interface HibahTahunDoc {
  _id: Id; tahun: number; aktif: boolean;
  kunciTahun: { terkunci: boolean; oleh?: Id | null; waktu?: Date | null };
  kunciPd: KunciPd[];
  riwayatBukaKunci: { cakupan: string; alasan: string; oleh: Id; waktu: Date }[];
  dasarHukum: string[];
  createdAt: Date; updatedAt: Date;
}
const hibahTahunSchema = new Schema<HibahTahunDoc>(
  {
    tahun: { type: Number, required: true, unique: true },
    aktif: { type: Boolean, default: false },
    kunciTahun: { terkunci: { type: Boolean, default: false }, oleh: ref('User'), waktu: { type: Date, default: null } },
    kunciPd: [{ _id: false, skpdId: ref('Skpd', true), terkunci: Boolean, oleh: ref('User'), waktu: Date }],
    riwayatBukaKunci: [{ _id: false, cakupan: String, alasan: String, oleh: ref('User'), waktu: Date }],
    dasarHukum: { type: [String], default: [] },
  },
  opsi,
);
hibahTahunSchema.index({ aktif: 1 }, { unique: true, partialFilterExpression: { aktif: true } });
aud(hibahTahunSchema, 'hibah_tahun');
export const HibahTahun = buat('HibahTahun', hibahTahunSchema, 'hibah_tahun');

export interface PerpanjanganPd { skpdId: Id; selesaiBaru: Date; alasan: string; oleh: Id; waktu: Date }
export interface HibahJadwalDoc {
  _id: Id; tahun: number; tahapan: TahapanHibah; mulai: Date; selesai: Date; perpanjangan: PerpanjanganPd[];
  createdAt: Date; updatedAt: Date;
}
const hibahJadwalSchema = new Schema<HibahJadwalDoc>(
  {
    tahun: { type: Number, required: true },
    tahapan: { type: String, enum: TAHAPAN_HIBAH, required: true },
    mulai: { type: Date, required: true },
    selesai: { type: Date, required: true },
    perpanjangan: [{ _id: false, skpdId: ref('Skpd', true), selesaiBaru: Date, alasan: String, oleh: ref('User'), waktu: Date }],
  },
  opsi,
);
hibahJadwalSchema.index({ tahun: 1, tahapan: 1 }, { unique: true });
aud(hibahJadwalSchema, 'hibah_jadwal');
export const HibahJadwal = buat('HibahJadwal', hibahJadwalSchema, 'hibah_jadwal');

/* ---------- Master ---------- */

export interface HibahJenisPenerimaDoc {
  _id: Id; kode: string; nama: string; kelompok: KelompokHibah; bentuk: BentukHibah[]; identitas: JenisIdentitas;
  bebasTerusMenerus: boolean; sekaliSetahun: boolean; urutan: number; aktif: boolean;
}
const jenisPenerimaSchema = new Schema<HibahJenisPenerimaDoc>(
  {
    kode: { type: String, required: true, unique: true },
    nama: { type: String, required: true },
    kelompok: { type: String, enum: ['hibah', 'bansos'], required: true },
    bentuk: { type: [String], enum: ['uang', 'barang'], default: ['uang'] },
    identitas: { type: String, enum: ['nik', 'nik_kk', 'badan_hukum', 'lainnya'], default: 'lainnya' },
    bebasTerusMenerus: { type: Boolean, default: false },
    sekaliSetahun: { type: Boolean, default: false },
    urutan: { type: Number, default: 0 },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
aud(jenisPenerimaSchema, 'hibah_jenis_penerima');
export const HibahJenisPenerima = buat('HibahJenisPenerima', jenisPenerimaSchema, 'hibah_jenis_penerima');

/** Butir checklist; `jenisPenerimaKode` boleh kode kelompok "hibah"/"bansos" untuk butir umum. */
export interface HibahChecklistDoc {
  _id: Id; jenisPenerimaKode: string; urutan: number; pertanyaan: string; dasar: string; wajib: boolean; butuhBerkas: boolean;
  versi: number; aktif: boolean;
}
const checklistSchema = new Schema<HibahChecklistDoc>(
  {
    jenisPenerimaKode: { type: String, required: true },
    urutan: { type: Number, default: 0 },
    pertanyaan: { type: String, required: true },
    dasar: { type: String, default: '' },
    wajib: { type: Boolean, default: true },
    butuhBerkas: { type: Boolean, default: false },
    versi: { type: Number, default: 1 },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
checklistSchema.index({ jenisPenerimaKode: 1, aktif: 1, urutan: 1 });
aud(checklistSchema, 'hibah_checklist');
export const HibahChecklist = buat('HibahChecklist', checklistSchema, 'hibah_checklist');

/** Berkas wajib; `jenisPenerimaKode` "*" = semua jenis. */
export interface HibahBerkasWajibDoc {
  _id: Id; jenisPenerimaKode: string; kode: string; nama: string; tingkat: 'penerima' | 'usulan'; wajib: boolean; sensitif: boolean;
  aktif: boolean;
}
const berkasWajibSchema = new Schema<HibahBerkasWajibDoc>(
  {
    jenisPenerimaKode: { type: String, required: true },
    kode: { type: String, required: true },
    nama: { type: String, required: true },
    tingkat: { type: String, enum: ['penerima', 'usulan'], default: 'usulan' },
    wajib: { type: Boolean, default: true },
    sensitif: { type: Boolean, default: false },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
berkasWajibSchema.index({ jenisPenerimaKode: 1, kode: 1 }, { unique: true });
aud(berkasWajibSchema, 'hibah_berkas_wajib');
export const HibahBerkasWajib = buat('HibahBerkasWajib', berkasWajibSchema, 'hibah_berkas_wajib');

export interface HibahTujuanBansosDoc { _id: Id; kode: string; nama: string; aktif: boolean }
const tujuanSchema = new Schema<HibahTujuanBansosDoc>(
  { kode: { type: String, required: true, unique: true }, nama: { type: String, required: true }, aktif: { type: Boolean, default: true } },
  opsi,
);
aud(tujuanSchema, 'hibah_tujuan_bansos');
export const HibahTujuanBansos = buat('HibahTujuanBansos', tujuanSchema, 'hibah_tujuan_bansos');

export interface HibahRekeningDoc { _id: Id; kodeRekening: string; nama: string; jenisPenerimaKode: string[]; aktif: boolean }
const rekeningHibahSchema = new Schema<HibahRekeningDoc>(
  {
    kodeRekening: { type: String, required: true, unique: true },
    nama: { type: String, default: '' },
    jenisPenerimaKode: { type: [String], default: [] },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
aud(rekeningHibahSchema, 'hibah_rekening');
export const HibahRekening = buat('HibahRekening', rekeningHibahSchema, 'hibah_rekening');

export interface HibahSusunanDoc { _id: Id; tahun: number; urutan: number; nama: string; nip: string; jabatanTapd: string }
const susunanSchema = new Schema<HibahSusunanDoc>(
  {
    tahun: { type: Number, required: true },
    urutan: { type: Number, default: 0 },
    nama: { type: String, required: true },
    nip: { type: String, default: '' },
    jabatanTapd: { type: String, required: true },
  },
  opsi,
);
susunanSchema.index({ tahun: 1, urutan: 1 });
aud(susunanSchema, 'hibah_susunan');
export const HibahSusunan = buat('HibahSusunan', susunanSchema, 'hibah_susunan');

export type JenisTemplat = 'rekomendasi' | 'berita_acara' | 'lampiran';
export interface HibahTemplatDoc {
  _id: Id; jenis: JenisTemplat; skpdId: Id | null; gridfsId: Id; nama: string; versi: number; aktif: boolean; diunggahOleh: Id;
  createdAt: Date;
}
const templatSchema = new Schema<HibahTemplatDoc>(
  {
    jenis: { type: String, enum: ['rekomendasi', 'berita_acara', 'lampiran'], required: true },
    skpdId: ref('Skpd'),
    gridfsId: { type: Schema.Types.ObjectId, required: true },
    nama: { type: String, required: true },
    versi: { type: Number, default: 1 },
    aktif: { type: Boolean, default: true },
    diunggahOleh: ref('User', true),
  },
  opsi,
);
templatSchema.index({ jenis: 1, skpdId: 1, aktif: 1 });
aud(templatSchema, 'hibah_templat');
export const HibahTemplat = buat('HibahTemplat', templatSchema, 'hibah_templat');

/* ---------- Wilayah (dipakai bersama) ---------- */

export interface WilayahKecamatanDoc { _id: Id; kode: string; nama: string; aktif: boolean }
const kecamatanSchema = new Schema<WilayahKecamatanDoc>(
  { kode: { type: String, required: true, unique: true }, nama: { type: String, required: true }, aktif: { type: Boolean, default: true } },
  opsi,
);
aud(kecamatanSchema, 'wilayah_kecamatan');
export const WilayahKecamatan = buat('WilayahKecamatan', kecamatanSchema, 'wilayah_kecamatan');

export interface WilayahDesaDoc { _id: Id; kode: string; nama: string; jenis: 'desa' | 'kelurahan'; kecamatanKode: string; aktif: boolean }
const desaSchema = new Schema<WilayahDesaDoc>(
  {
    kode: { type: String, required: true, unique: true },
    nama: { type: String, required: true },
    jenis: { type: String, enum: ['desa', 'kelurahan'], default: 'desa' },
    kecamatanKode: { type: String, required: true },
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
desaSchema.index({ kecamatanKode: 1, nama: 1 });
aud(desaSchema, 'wilayah_desa');
export const WilayahDesa = buat('WilayahDesa', desaSchema, 'wilayah_desa');

/* ---------- Google Drive dan penomoran ---------- */

export interface HibahDriveDoc {
  _id: Id; kunci: 'utama'; email: string; tokenTerenkripsi: string; folderAkarId: string; folder: Record<string, string>;
  kuota: { total: number | null; dipakai: number | null; diperbarui: Date | null };
  status: 'terhubung' | 'putus'; terhubungOleh: Id; updatedAt: Date;
}
const driveSchema = new Schema<HibahDriveDoc>(
  {
    kunci: { type: String, default: 'utama', unique: true },
    email: String,
    tokenTerenkripsi: String,
    folderAkarId: String,
    folder: { type: Schema.Types.Mixed, default: {} },
    kuota: { total: { type: Number, default: null }, dipakai: { type: Number, default: null }, diperbarui: { type: Date, default: null } },
    status: { type: String, enum: ['terhubung', 'putus'], default: 'terhubung' },
    terhubungOleh: ref('User'),
  },
  { ...opsi, minimize: false },
);
aud(driveSchema, 'hibah_drive');
export const HibahDrive = buat('HibahDrive', driveSchema, 'hibah_drive');

export interface HibahNomorDoc { _id: string; nilai: number }
const nomorSchema = new Schema<HibahNomorDoc>({ _id: String, nilai: { type: Number, default: 0 } }, { versionKey: false });
export const HibahNomor = buat('HibahNomor', nomorSchema, 'hibah_nomor');

/* ---------- Penerima dan riwayat ---------- */

export interface IdentitasTerenkripsi { jenis: JenisIdentitas; sandi: string; sidik: string; samaran: string }
export interface HibahPenerimaDoc {
  _id: Id; jenisPenerimaKode: string; nama: string; namaNormal: string;
  identitas?: IdentitasTerenkripsi | null; kk?: { sandi: string; sidik: string; samaran: string } | null;
  alamat: string; kecamatanKode: string; desaKode: string; kontak: string; penanggungJawab: string;
  skpdPembuatId: Id; createdAt: Date; updatedAt: Date;
}
const penerimaSchema = new Schema<HibahPenerimaDoc>(
  {
    jenisPenerimaKode: { type: String, required: true },
    nama: { type: String, required: true },
    namaNormal: { type: String, required: true },
    identitas: { type: { _id: false, jenis: String, sandi: String, sidik: String, samaran: String }, default: null },
    kk: { type: { _id: false, sandi: String, sidik: String, samaran: String }, default: null },
    alamat: { type: String, default: '' },
    kecamatanKode: { type: String, default: '' },
    desaKode: { type: String, default: '' },
    kontak: { type: String, default: '' },
    penanggungJawab: { type: String, default: '' },
    skpdPembuatId: ref('Skpd', true),
  },
  opsi,
);
penerimaSchema.index({ 'identitas.sidik': 1 }, { unique: true, partialFilterExpression: { 'identitas.sidik': { $type: 'string' } } });
penerimaSchema.index({ desaKode: 1, namaNormal: 1 });
penerimaSchema.index({ namaNormal: 1 });
aud(penerimaSchema, 'hibah_penerima');
export const HibahPenerima = buat('HibahPenerima', penerimaSchema, 'hibah_penerima');

export interface HibahRiwayatDoc {
  _id: Id; tahun: number; kelompok: KelompokHibah; jenisPenerimaKode: string | null; jenisTeks: string; nama: string; namaNormal: string;
  sidikIdentitas: string | null; samaran: string; alamat: string; kecamatanKode: string; desaKode: string; namaPd: string; skpdId: Id | null;
  bentuk: BentukHibah; nilai: number; keterangan: string; imporId: Id; baris: number;
}
const riwayatSchema = new Schema<HibahRiwayatDoc>(
  {
    tahun: { type: Number, required: true },
    kelompok: { type: String, enum: ['hibah', 'bansos'], required: true },
    jenisPenerimaKode: { type: String, default: null },
    jenisTeks: { type: String, default: '' },
    nama: { type: String, required: true },
    namaNormal: { type: String, required: true },
    sidikIdentitas: { type: String, default: null },
    samaran: { type: String, default: '' },
    alamat: { type: String, default: '' },
    kecamatanKode: { type: String, default: '' },
    desaKode: { type: String, default: '' },
    namaPd: { type: String, default: '' },
    skpdId: ref('Skpd'),
    bentuk: { type: String, enum: ['uang', 'barang'], default: 'uang' },
    nilai: { type: Number, default: 0 },
    keterangan: { type: String, default: '' },
    imporId: { type: Schema.Types.ObjectId },
    baris: Number,
  },
  { versionKey: false, timestamps: true },
);
riwayatSchema.index({ sidikIdentitas: 1 });
riwayatSchema.index({ desaKode: 1, namaNormal: 1 });
riwayatSchema.index({ tahun: 1 });
export const HibahRiwayat = buat('HibahRiwayat', riwayatSchema, 'hibah_riwayat');

/* ---------- Usulan ---------- */

export interface RincianUsulan {
  _id: Id; uraian: string; spesifikasi: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number;
  nilaiRekomendasi: number | null; catatanRekomendasi: string;
}
export interface ButirEvaluasi { butirId: Id; versi: number; pertanyaan: string; dasar: string; wajib: boolean; jawaban: 'ya' | 'tidak' | null; catatan: string; berkasIds: Id[] }
export type KodePeringatan = 'RIWAYAT' | 'DOBEL' | 'KL_SETAHUN' | 'USULAN_LAIN';
export interface PeringatanUsulan {
  kode: KodePeringatan; pesan: string; sumber: { jenis: 'riwayat' | 'usulan'; id: Id; tahun: number; label: string }[]; catatanOperator: string;
}
export type KodeAspek = 'tusi' | 'program' | 'duplikasi' | 'keuangan';
export interface HibahUsulanDoc {
  _id: Id; tahun: number; nomor: string; skpdId: Id; penerimaId: Id;
  jenisPenerimaKode: string; kelompok: KelompokHibah; bentuk: BentukHibah;
  subkegiatanKode: string; subkegiatanNama: string; kodeRekening: string; peruntukan: string; tujuanBansosKode: string;
  proposal: { nomor: string; tanggal: Date | null };
  rincian: RincianUsulan[];
  nilaiUsulan: number; nilaiRekomendasi: number; nilaiDisetujui: number | null;
  evaluasi: { checklist: ButirEvaluasi[]; kesimpulan: 'layak' | 'tidak_layak' | null; catatan: string; oleh: Id | null; waktu: Date | null };
  peringatan: PeringatanUsulan[];
  rekomendasiId: Id | null; nilaiRekomendasiTerakhirDisahkan: number | null;
  verifikasi: {
    aspek: { kode: KodeAspek; memenuhi: boolean | null; catatan: string }[];
    keputusan: 'disetujui' | 'ditolak' | 'perbaikan' | null; nilaiDisetujui: number | null; alasan: string; oleh: Id | null; waktu: Date | null;
  };
  status: StatusUsulan;
  riwayatStatus: { status: StatusUsulan; waktu: Date; userId: Id; catatan: string }[];
  createdAt: Date; updatedAt: Date;
}
const usulanSchema = new Schema<HibahUsulanDoc>(
  {
    tahun: { type: Number, required: true },
    nomor: { type: String, required: true, unique: true },
    skpdId: ref('Skpd', true),
    penerimaId: ref('HibahPenerima', true),
    jenisPenerimaKode: { type: String, required: true },
    kelompok: { type: String, enum: ['hibah', 'bansos'], required: true },
    bentuk: { type: String, enum: ['uang', 'barang'], required: true },
    subkegiatanKode: { type: String, default: '' },
    subkegiatanNama: { type: String, default: '' },
    kodeRekening: { type: String, default: '' },
    peruntukan: { type: String, default: '' },
    tujuanBansosKode: { type: String, default: '' },
    proposal: { nomor: { type: String, default: '' }, tanggal: { type: Date, default: null } },
    rincian: [
      {
        uraian: String, spesifikasi: { type: String, default: '' }, volume: Number, satuan: String, hargaSatuan: Number, jumlah: Number,
        nilaiRekomendasi: { type: Number, default: null }, catatanRekomendasi: { type: String, default: '' },
      },
    ],
    nilaiUsulan: { type: Number, default: 0 },
    nilaiRekomendasi: { type: Number, default: 0 },
    nilaiDisetujui: { type: Number, default: null },
    evaluasi: {
      checklist: [
        {
          _id: false, butirId: Schema.Types.ObjectId, versi: Number, pertanyaan: String, dasar: String, wajib: Boolean,
          jawaban: { type: String, enum: ['ya', 'tidak', null], default: null }, catatan: { type: String, default: '' },
          berkasIds: { type: [Schema.Types.ObjectId], default: [] },
        },
      ],
      kesimpulan: { type: String, enum: ['layak', 'tidak_layak', null], default: null },
      catatan: { type: String, default: '' },
      oleh: ref('User'),
      waktu: { type: Date, default: null },
    },
    peringatan: [
      {
        _id: false, kode: String, pesan: String,
        sumber: [{ _id: false, jenis: String, id: Schema.Types.ObjectId, tahun: Number, label: String }],
        catatanOperator: { type: String, default: '' },
      },
    ],
    rekomendasiId: ref('HibahRekomendasi'),
    nilaiRekomendasiTerakhirDisahkan: { type: Number, default: null },
    verifikasi: {
      aspek: [{ _id: false, kode: String, memenuhi: { type: Boolean, default: null }, catatan: { type: String, default: '' } }],
      keputusan: { type: String, enum: ['disetujui', 'ditolak', 'perbaikan', null], default: null },
      nilaiDisetujui: { type: Number, default: null },
      alasan: { type: String, default: '' },
      oleh: ref('User'),
      waktu: { type: Date, default: null },
    },
    status: { type: String, enum: STATUS_USULAN, default: 'draf' },
    riwayatStatus: [{ _id: false, status: String, waktu: Date, userId: Schema.Types.ObjectId, catatan: { type: String, default: '' } }],
  },
  opsi,
);
usulanSchema.index({ tahun: 1, skpdId: 1, status: 1 });
usulanSchema.index({ penerimaId: 1, tahun: 1 });
usulanSchema.index({ rekomendasiId: 1 });
aud(usulanSchema, 'hibah_usulan');
export const HibahUsulan = buat('HibahUsulan', usulanSchema, 'hibah_usulan');

/* ---------- Rekomendasi, Berita Acara, berkas, impor ---------- */

export interface HibahRekomendasiDoc {
  _id: Id; tahun: number; skpdId: Id; nomor: string; tanggal: Date; perihal: string; kepalaPd: { nama: string; nip: string };
  usulanIds: Id[]; cuplikan: { usulanId: Id; nilaiUsulan: number; nilaiRekomendasi: number }[];
  status: 'draf' | 'diunggah' | 'batal'; berkasId: Id | null; createdAt: Date; updatedAt: Date;
}
const rekomendasiSchema = new Schema<HibahRekomendasiDoc>(
  {
    tahun: { type: Number, required: true },
    skpdId: ref('Skpd', true),
    nomor: { type: String, required: true },
    tanggal: { type: Date, required: true },
    perihal: { type: String, default: '' },
    kepalaPd: { nama: { type: String, default: '' }, nip: { type: String, default: '' } },
    usulanIds: { type: [Schema.Types.ObjectId], default: [] },
    cuplikan: [{ _id: false, usulanId: Schema.Types.ObjectId, nilaiUsulan: Number, nilaiRekomendasi: Number }],
    status: { type: String, enum: ['draf', 'diunggah', 'batal'], default: 'draf' },
    berkasId: ref('HibahBerkas'),
  },
  opsi,
);
rekomendasiSchema.index({ tahun: 1, skpdId: 1, status: 1 });
aud(rekomendasiSchema, 'hibah_rekomendasi');
export const HibahRekomendasi = buat('HibahRekomendasi', rekomendasiSchema, 'hibah_rekomendasi');

export interface HibahBeritaAcaraDoc {
  _id: Id; tahun: number; nomor: string; tanggal: Date; cakupan: { semua: boolean; skpdIds: Id[] }; sidikKunci: string;
  status: 'draf' | 'diunggah' | 'usang'; berkasId: Id | null; createdAt: Date; updatedAt: Date;
}
const baSchema = new Schema<HibahBeritaAcaraDoc>(
  {
    tahun: { type: Number, required: true },
    nomor: { type: String, required: true },
    tanggal: { type: Date, required: true },
    cakupan: { semua: { type: Boolean, default: true }, skpdIds: { type: [Schema.Types.ObjectId], default: [] } },
    sidikKunci: { type: String, required: true },
    status: { type: String, enum: ['draf', 'diunggah', 'usang'], default: 'draf' },
    berkasId: ref('HibahBerkas'),
  },
  opsi,
);
baSchema.index({ tahun: 1 });
aud(baSchema, 'hibah_berita_acara');
export const HibahBeritaAcara = buat('HibahBeritaAcara', baSchema, 'hibah_berita_acara');

export type PemilikBerkas = 'penerima' | 'usulan' | 'rekomendasi' | 'berita_acara';
export interface HibahBerkasDoc {
  _id: Id; pemilik: { jenis: PemilikBerkas; id: Id }; skpdId: Id | null; tahun: number | null; jenisDokumen: string; nama: string; mime: string;
  ukuran: number; sha256: string; gridfsId: Id | null; driveId: string | null; status: 'menunggu' | 'tersimpan' | 'gagal';
  percobaan: number; galatTerakhir: string; sensitif: boolean; diunggahOleh: Id; aktif: boolean; createdAt: Date; updatedAt: Date;
}
const berkasSchema = new Schema<HibahBerkasDoc>(
  {
    pemilik: { jenis: { type: String, enum: ['penerima', 'usulan', 'rekomendasi', 'berita_acara'], required: true }, id: { type: Schema.Types.ObjectId, required: true } },
    skpdId: ref('Skpd'),
    tahun: { type: Number, default: null },
    jenisDokumen: { type: String, required: true },
    nama: { type: String, required: true },
    mime: { type: String, required: true },
    ukuran: { type: Number, required: true },
    sha256: { type: String, required: true },
    gridfsId: { type: Schema.Types.ObjectId, default: null },
    driveId: { type: String, default: null },
    status: { type: String, enum: ['menunggu', 'tersimpan', 'gagal'], default: 'menunggu' },
    percobaan: { type: Number, default: 0 },
    galatTerakhir: { type: String, default: '' },
    sensitif: { type: Boolean, default: false },
    diunggahOleh: ref('User', true),
    aktif: { type: Boolean, default: true },
  },
  opsi,
);
berkasSchema.index({ 'pemilik.jenis': 1, 'pemilik.id': 1 });
berkasSchema.index({ status: 1, updatedAt: 1 });
aud(berkasSchema, 'hibah_berkas');
export const HibahBerkas = buat('HibahBerkas', berkasSchema, 'hibah_berkas');

/** Impor riwayat/wilayah: baris hasil baca disimpan untuk pratinjau, lalu diterapkan. */
export interface HibahImporDoc {
  _id: Id; jenis: 'riwayat' | 'wilayah'; tahun: number | null; namaFile: string; status: 'pratinjau' | 'diterapkan' | 'batal';
  diproses: Record<string, unknown>[]; ditahan: { baris: number; alasan: string; data: Record<string, unknown> }[];
  catatan: { baris: number; pesan: string }[]; jumlahLama: number; oleh: Id; createdAt: Date;
}
const imporSchema = new Schema<HibahImporDoc>(
  {
    jenis: { type: String, enum: ['riwayat', 'wilayah'], required: true },
    tahun: { type: Number, default: null },
    namaFile: String,
    status: { type: String, enum: ['pratinjau', 'diterapkan', 'batal'], default: 'pratinjau' },
    diproses: { type: Schema.Types.Mixed, default: () => [] },
    ditahan: { type: Schema.Types.Mixed, default: () => [] },
    catatan: { type: Schema.Types.Mixed, default: () => [] },
    jumlahLama: { type: Number, default: 0 },
    oleh: ref('User', true),
  },
  { versionKey: false, timestamps: true },
);
export const HibahImpor = buat('HibahImpor', imporSchema, 'hibah_impor');

export const semuaModelHibah = [
  HibahTahun, HibahJadwal, HibahJenisPenerima, HibahChecklist, HibahBerkasWajib, HibahTujuanBansos, HibahRekening, HibahSusunan,
  HibahTemplat, WilayahKecamatan, WilayahDesa, HibahDrive, HibahPenerima, HibahRiwayat, HibahUsulan, HibahRekomendasi,
  HibahBeritaAcara, HibahBerkas, HibahImpor,
];
