import { z } from 'zod';

/** Uang selalu rupiah bulat, tidak pernah pecahan. */
export const uang = z.number().int().nonnegative();

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'ID tidak valid');

export const peran = z.enum(['super_admin', 'admin', 'skpd']);
export const jenisTahapan = z.enum(['KUA_PPAS', 'RAPBD', 'APBD', 'PERGESERAN', 'PERUBAHAN']);
export const jenisImpor = z.enum(['apbd', 'nomenklatur', 'sumber_dana', 'rekening', 'tagging', 'verifikasi', 'skpd']);

export const login = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Syarat sandi baru: satu sumber untuk validasi server dan daftar cek di formulir. */
export const ATURAN_SANDI: { kode: string; label: string; cek: (s: string) => boolean }[] = [
  { kode: 'panjang', label: 'Minimal 10 karakter', cek: (s) => s.length >= 10 },
  { kode: 'kecil', label: 'Ada huruf kecil (a–z)', cek: (s) => /[a-z]/.test(s) },
  { kode: 'besar', label: 'Ada huruf besar (A–Z)', cek: (s) => /[A-Z]/.test(s) },
  { kode: 'angka', label: 'Ada angka (0–9)', cek: (s) => /\d/.test(s) },
];

export const gantiSandi = z
  .object({
    sandiLama: z.string().min(1),
    sandiBaru: z
      .string()
      .max(128, 'Maksimal 128 karakter')
      .superRefine((s, ctx) => {
        for (const a of ATURAN_SANDI) if (!a.cek(s)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: a.label });
      }),
    ulangiSandi: z.string(),
  })
  .refine((v) => v.sandiBaru === v.ulangiSandi, { message: 'Ulangi sandi tidak sama', path: ['ulangiSandi'] })
  .refine((v) => v.sandiBaru !== v.sandiLama, { message: 'Sandi baru harus berbeda dari sandi lama', path: ['sandiBaru'] });

export const paginasi = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const alokasiInput = z
  .object({
    updatedAt: z.string().min(1),
    alokasi: z
      .array(z.object({ sumberDanaId: objectId, nilai: uang }).strict())
      .max(50),
  })
  .strict()
  .refine((v) => new Set(v.alokasi.map((a) => a.sumberDanaId)).size === v.alokasi.length, {
    message: 'Sumber dana tidak boleh ganda',
    path: ['alokasi'],
  });

export const paguSumberDanaInput = z
  .object({
    pagu: z.array(z.object({ sumberDanaId: objectId, nilai: uang.nullable() }).strict()).max(2000),
  })
  .strict();

export const tahunInput = z.object({ tahun: z.number().int().min(2020).max(2100) }).strict();
export const tahunUbah = z.object({ status: z.enum(['aktif', 'arsip']) }).strict();

export const tahapanInput = z
  .object({
    tahun: z.number().int().min(2020).max(2100),
    jenis: jenisTahapan,
    nama: z.string().trim().min(1).max(100).optional(),
    jadwalMulai: z.coerce.date(),
    jadwalSelesai: z.coerce.date(),
  })
  .strict()
  .refine((v) => v.jadwalSelesai > v.jadwalMulai, { message: 'Jadwal selesai harus setelah mulai', path: ['jadwalSelesai'] });

export const tahapanUbah = z
  .object({
    nama: z.string().trim().min(1).max(100).optional(),
    jadwalMulai: z.coerce.date().optional(),
    jadwalSelesai: z.coerce.date().optional(),
  })
  .strict();

export const bukaTahapanInput = z.object({ alasan: z.string().trim().max(500).optional() }).strict();

export const skpdInput = z
  .object({ kode: z.string().trim().min(1).max(64), nama: z.string().trim().min(1).max(300), aktif: z.boolean().optional() })
  .strict();
export const skpdUbah = skpdInput.partial();
export const subUnitInput = skpdInput.extend({ skpdId: objectId }).strict();

export const penggunaInput = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Hanya huruf, angka, titik, garis bawah, strip'),
    nama: z.string().trim().min(1).max(200),
    peran,
    skpdId: objectId.optional().nullable(),
  })
  .strict()
  .refine((v) => v.peran !== 'skpd' || !!v.skpdId, { message: 'Akun SKPD wajib memilih SKPD', path: ['skpdId'] });

export const penggunaUbah = z
  .object({
    nama: z.string().trim().min(1).max(200).optional(),
    peran: peran.optional(),
    skpdId: objectId.optional().nullable(),
    aktif: z.boolean().optional(),
  })
  .strict();

export const sumberDanaInput = z
  .object({
    kode: z.string().trim().min(1).max(64),
    nama: z.string().trim().min(1).max(300),
    khusus: z.boolean().default(false),
    namaTagging: z.string().trim().max(200).optional().nullable(),
    aktif: z.boolean().optional(),
  })
  .strict();
export const sumberDanaUbah = z
  .object({
    nama: z.string().trim().min(1).max(300).optional(),
    khusus: z.boolean().optional(),
    namaTagging: z.string().trim().max(200).optional().nullable(),
    aktif: z.boolean().optional(),
  })
  .strict();

export const jenisNomenklatur = z.enum(['urusan', 'bidang', 'program', 'kegiatan', 'subkegiatan']);
export const nomenklaturInput = z
  .object({
    jenis: jenisNomenklatur,
    kode: z.string().trim().min(1).max(40),
    nama: z.string().trim().min(1).max(500),
  })
  .strict();
export const nomenklaturUbah = z
  .object({ nama: z.string().trim().min(1).max(500).optional(), aktif: z.boolean().optional() })
  .strict();

export const rekeningInput = z
  .object({ kode: z.string().trim().min(1).max(40).regex(/^[0-9.]+$/, 'Kode hanya angka dan titik'), nama: z.string().trim().min(1).max(500) })
  .strict();
export const rekeningUbah = z.object({ nama: z.string().trim().min(1).max(500) }).strict();

export const taggingInput = z
  .object({
    tahun: z.number().int().min(2020).max(2100),
    sumberDanaId: objectId,
    kodeSubkegiatan: z.string().trim().min(5).max(40),
    kategori: z.string().trim().max(500).optional().default(''),
    rincian: z.string().trim().max(500).optional().default(''),
    kinerja: z.string().trim().max(500).optional(),
    indikator: z.string().trim().max(500).optional(),
    satuan: z.string().trim().max(100).optional(),
  })
  .strict();
export const taggingUbah = z
  .object({
    kategori: z.string().trim().max(500).optional(),
    rincian: z.string().trim().max(500).optional(),
    kinerja: z.string().trim().max(500).optional(),
    indikator: z.string().trim().max(500).optional(),
    satuan: z.string().trim().max(100).optional(),
  })
  .strict();

export const abaikanNotifikasi = z.object({ alasan: z.string().trim().min(3).max(500) }).strict();

export const filterSubkegiatan = paginasi.extend({
  skpd: objectId.optional(),
  subUnit: objectId.optional(),
  sumberDana: objectId.optional(),
  status: z.enum(['semua', 'tidak_seimbang', 'beda', 'tidak_ada_di_impor']).optional(),
  /** Banyaknya sumber dana (alokasi bernilai > 0): satu, dua atau lebih, lebih dari dua. */
  jumlahSd: z.enum(['satu', 'dua_lebih', 'lebih_dua']).optional(),
  q: z.string().trim().max(100).optional(),
});

/** Baris rincian APBD ekspor SIPD setelah header dicocokkan. */
export const barisApbd = z.object({
  TAHUN: z.coerce.number().int(),
  'KODE SKPD': z.string().trim().min(1),
  'NAMA SKPD': z.string().trim().min(1),
  'KODE SUB UNIT': z.string().trim().min(1),
  'NAMA SUB UNIT': z.string().trim().min(1),
  'KODE SUB KEGIATAN': z.string().trim().min(5),
  'NAMA SUB KEGIATAN': z.string().trim().min(1),
  'KODE SUMBER DANA': z.string().trim().min(1),
  'NAMA SUMBER DANA': z.string().trim().min(1),
  'KODE REKENING': z.string().trim().min(1),
  PAGU: uang,
});

export type AlokasiInput = z.infer<typeof alokasiInput>;
export type TahapanInput = z.infer<typeof tahapanInput>;
export type PenggunaInput = z.infer<typeof penggunaInput>;
export type FilterSubkegiatan = z.infer<typeof filterSubkegiatan>;
export { z };
