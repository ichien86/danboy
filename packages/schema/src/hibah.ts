import { z } from 'zod';

/* Skema masukan modul Hibah dan Bansos. Nilai uang selalu rupiah bulat. */

const id = z.string().regex(/^[0-9a-f]{24}$/i, 'ID tidak valid');
const uang = z.number().int().nonnegative();
const teks = (maks = 500) => z.string().trim().max(maks);
const wajib = (maks = 500) => z.string().trim().min(1, 'Wajib diisi').max(maks);
const tahun = z.number().int().min(2020).max(2100);

export const tahapanHibah = z.enum(['input', 'evaluasi', 'verifikasi', 'perbaikan', 'penetapan']);
export const kelompokHibah = z.enum(['hibah', 'bansos']);
export const bentukHibah = z.enum(['uang', 'barang']);
export const jenisIdentitas = z.enum(['nik', 'nik_kk', 'badan_hukum', 'lainnya']);

export const tahunHibahInput = z.object({ tahun }).strict();
export const tahunHibahUbah = z.object({ aktif: z.literal(true).optional(), dasarHukum: z.array(wajib(500)).max(30).optional() }).strict();

export const jadwalInput = z
  .object({
    jadwal: z
      .array(z.object({ tahapan: tahapanHibah, mulai: z.coerce.date(), selesai: z.coerce.date() }).strict())
      .min(1)
      .max(5),
  })
  .strict()
  .refine((v) => v.jadwal.every((j) => j.selesai >= j.mulai), { message: 'Tanggal selesai tidak boleh sebelum mulai', path: ['jadwal'] });

export const perpanjanganInput = z
  .object({ tahapan: tahapanHibah, skpdId: id, selesaiBaru: z.coerce.date(), alasan: wajib(500) })
  .strict();

/* ---------- Master ---------- */

export const jenisPenerimaInput = z
  .object({
    kode: wajib(20),
    nama: wajib(200),
    kelompok: kelompokHibah,
    bentuk: z.array(bentukHibah).min(1),
    identitas: jenisIdentitas,
    bebasTerusMenerus: z.boolean().default(false),
    sekaliSetahun: z.boolean().default(false),
    urutan: z.number().int().default(0),
    aktif: z.boolean().default(true),
  })
  .strict();

export const checklistInput = z
  .object({
    jenisPenerimaKode: wajib(20),
    urutan: z.number().int().default(0),
    pertanyaan: wajib(500),
    dasar: teks(200).default(''),
    wajib: z.boolean().default(true),
    butuhBerkas: z.boolean().default(false),
    aktif: z.boolean().default(true),
  })
  .strict();

export const berkasWajibInput = z
  .object({
    jenisPenerimaKode: wajib(20),
    kode: wajib(40).regex(/^[a-z0-9_]+$/, 'Huruf kecil, angka, garis bawah'),
    nama: wajib(200),
    tingkat: z.enum(['penerima', 'usulan']),
    wajib: z.boolean().default(true),
    sensitif: z.boolean().default(false),
    aktif: z.boolean().default(true),
  })
  .strict();

export const tujuanBansosInput = z.object({ kode: wajib(20), nama: wajib(200), aktif: z.boolean().default(true) }).strict();
export const rekeningHibahInput = z
  .object({ kodeRekening: wajib(40).regex(/^5\.1\.0[56][0-9.]*$/, 'Kode rekening hibah (5.1.05) atau bansos (5.1.06)'), nama: teks(300).default(''), jenisPenerimaKode: z.array(wajib(20)).default([]), aktif: z.boolean().default(true) })
  .strict();
export const susunanInput = z.object({ tahun, urutan: z.number().int().default(0), nama: wajib(200), nip: teks(30).default(''), jabatanTapd: wajib(200) }).strict();
export const kecamatanInput = z.object({ kode: wajib(20), nama: wajib(100), aktif: z.boolean().default(true) }).strict();
export const desaInput = z
  .object({ kode: wajib(20), nama: wajib(100), jenis: z.enum(['desa', 'kelurahan']), kecamatanKode: wajib(20), aktif: z.boolean().default(true) })
  .strict();

export const JENIS_MASTER_HIBAH = ['jenis-penerima', 'checklist', 'berkas-wajib', 'tujuan-bansos', 'rekening', 'susunan', 'kecamatan', 'desa'] as const;
export type JenisMasterHibah = (typeof JENIS_MASTER_HIBAH)[number];
export const skemaMasterHibah = {
  'jenis-penerima': jenisPenerimaInput,
  checklist: checklistInput,
  'berkas-wajib': berkasWajibInput,
  'tujuan-bansos': tujuanBansosInput,
  rekening: rekeningHibahInput,
  susunan: susunanInput,
  kecamatan: kecamatanInput,
  desa: desaInput,
} as const;

/* ---------- Penerima ---------- */

export const penerimaInput = z
  .object({
    jenisPenerimaKode: wajib(20),
    nama: wajib(300),
    /** NIK (16 digit) atau nomor badan hukum, sesuai jenis penerima */
    identitas: teks(60).optional().nullable(),
    /** Nomor KK, khusus jenis Keluarga */
    nomorKk: teks(30).optional().nullable(),
    alamat: teks(500).default(''),
    kecamatanKode: teks(20).default(''),
    desaKode: teks(20).default(''),
    kontak: teks(100).default(''),
    penanggungJawab: teks(200).default(''),
  })
  .strict();
export const penerimaUbah = penerimaInput.partial().extend({ updatedAt: z.string().min(1) }).strict();
export const cekPenerimaInput = z
  .object({ jenisPenerimaKode: teks(20).optional(), identitas: teks(60).optional().nullable(), nama: teks(300).optional(), desaKode: teks(20).optional() })
  .strict();

/* ---------- Usulan ---------- */

export const rincianInput = z
  .object({
    _id: id.optional(),
    uraian: wajib(500),
    spesifikasi: teks(500).default(''),
    volume: z.number().positive('Volume harus lebih dari 0').max(1e9),
    satuan: wajib(50),
    hargaSatuan: uang,
  })
  .strict();

const dataUsulan = {
  bentuk: bentukHibah,
  subkegiatanKode: teks(40).default(''),
  kodeRekening: teks(40).default(''),
  peruntukan: teks(1000).default(''),
  tujuanBansosKode: teks(20).default(''),
  proposalNomor: teks(100).default(''),
  proposalTanggal: z.coerce.date().optional().nullable(),
  rincian: z.array(rincianInput).max(200).default([]),
};
export const usulanInput = z.object({ penerimaId: id, ...dataUsulan }).strict();
export const usulanUbah = z
  .object({
    updatedAt: z.string().min(1),
    bentuk: bentukHibah.optional(),
    subkegiatanKode: teks(40).optional(),
    kodeRekening: teks(40).optional(),
    peruntukan: teks(1000).optional(),
    tujuanBansosKode: teks(20).optional(),
    proposalNomor: teks(100).optional(),
    proposalTanggal: z.coerce.date().optional().nullable(),
    rincian: z.array(rincianInput).max(200).optional(),
  })
  .strict();

export const evaluasiInput = z
  .object({
    updatedAt: z.string().min(1),
    checklist: z.array(z.object({ butirId: id, jawaban: z.enum(['ya', 'tidak']).nullable(), catatan: teks(1000).default('') }).strict()).max(100).default([]),
    rincian: z.array(z.object({ _id: id, nilaiRekomendasi: uang.nullable(), catatanRekomendasi: teks(500).default('') }).strict()).max(200).default([]),
    peringatan: z.array(z.object({ kode: z.string().max(20), catatanOperator: teks(1000) }).strict()).max(20).default([]),
    catatan: teks(2000).default(''),
  })
  .strict();

export const kesimpulanInput = z.object({ updatedAt: z.string().min(1), kesimpulan: z.enum(['layak', 'tidak_layak']).nullable() }).strict();

export const kodeAspek = z.enum(['tusi', 'program', 'duplikasi', 'keuangan']);
export const verifikasiInput = z
  .object({
    updatedAt: z.string().min(1),
    aspek: z.array(z.object({ kode: kodeAspek, memenuhi: z.boolean().nullable(), catatan: teks(1000).default('') }).strict()).length(4),
    keputusan: z.enum(['disetujui', 'ditolak', 'perbaikan']),
    nilaiDisetujui: uang.nullable(),
    alasan: teks(2000).default(''),
  })
  .strict();

export const kirimUsulanInput = z.object({ updatedAt: z.string().min(1) }).strict();

/* ---------- Rekomendasi, kunci, Berita Acara ---------- */

export const rekomendasiInput = z
  .object({
    nomor: wajib(100),
    tanggal: z.coerce.date(),
    perihal: teks(300).default(''),
    kepalaPdNama: teks(200).default(''),
    kepalaPdNip: teks(30).default(''),
    usulanIds: z.array(id).min(1, 'Pilih minimal satu usulan Layak').max(500),
  })
  .strict();
export const rekomendasiUbah = rekomendasiInput.partial().extend({ updatedAt: z.string().min(1) }).strict();

export const kunciInput = z.object({ tahun, skpdId: id.optional().nullable() }).strict();
export const bukaKunciInput = z.object({ tahun, skpdId: id.optional().nullable(), alasan: wajib(1000) }).strict();
export const beritaAcaraInput = z.object({ tahun, nomor: wajib(100), tanggal: z.coerce.date(), skpdIds: z.array(id).max(200).optional() }).strict();

export const filterUsulan = z.object({
  tahun: z.coerce.number().int().optional(),
  skpd: id.optional(),
  jenis: z.string().max(20).optional(),
  bentuk: bentukHibah.optional(),
  status: z.string().max(30).optional(),
  peringatan: z.string().max(5).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type FilterUsulan = z.infer<typeof filterUsulan>;
