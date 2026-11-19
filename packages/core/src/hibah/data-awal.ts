import { HibahBerkasWajib, HibahChecklist, HibahJenisPenerima, HibahRekening, HibahTujuanBansos, Rekening, sambung } from '@danboy/db';

/*
 * Data awal master modul Hibah dan Bansos, disusun dari Lampiran Permendagri 17/2026 butir 3.3.1.5 (Belanja Hibah,
 * hlm. 98–104) dan 3.3.1.6 (Belanja Bantuan Sosial, hlm. 104–107). Ditinjau dan diubah Bapperida lewat menu Master.
 * Pemuatan bersifat idempoten: hanya menambah yang belum ada, data yang sudah diubah tidak ditimpa.
 */

export const JENIS_PENERIMA_AWAL = [
  { kode: 'H01', nama: 'Pemerintah pusat (satuan kerja K/L)', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'lainnya', bebasTerusMenerus: true, sekaliSetahun: true },
  { kode: 'H02', nama: 'Pemerintah daerah lainnya', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'lainnya', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H03', nama: 'BUMN', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H04', nama: 'BUMD', kelompok: 'hibah', bentuk: ['uang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H05', nama: 'BUMDesa', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H06', nama: 'Badan dan lembaga nirlaba', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H07', nama: 'Organisasi kemasyarakatan berbadan hukum', kelompok: 'hibah', bentuk: ['uang', 'barang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H08', nama: 'Partai politik', kelompok: 'hibah', bentuk: ['uang'], identitas: 'badan_hukum', bebasTerusMenerus: true, sekaliSetahun: false },
  { kode: 'H09', nama: 'Koperasi', kelompok: 'hibah', bentuk: ['uang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'H10', nama: 'Usaha mikro dan usaha kecil', kelompok: 'hibah', bentuk: ['uang'], identitas: 'lainnya', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'B01', nama: 'Individu', kelompok: 'bansos', bentuk: ['uang', 'barang'], identitas: 'nik', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'B02', nama: 'Keluarga', kelompok: 'bansos', bentuk: ['uang', 'barang'], identitas: 'nik_kk', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'B03', nama: 'Kelompok dan/atau masyarakat', kelompok: 'bansos', bentuk: ['uang', 'barang'], identitas: 'lainnya', bebasTerusMenerus: false, sekaliSetahun: false },
  { kode: 'B04', nama: 'Lembaga nonpemerintahan', kelompok: 'bansos', bentuk: ['uang', 'barang'], identitas: 'badan_hukum', bebasTerusMenerus: false, sekaliSetahun: false },
] as const;

export const TUJUAN_BANSOS_AWAL = [
  { kode: 'RS', nama: 'Rehabilitasi sosial' },
  { kode: 'PS', nama: 'Perlindungan sosial' },
  { kode: 'PB', nama: 'Pemberdayaan sosial' },
  { kode: 'JS', nama: 'Jaminan sosial' },
  { kode: 'PK', nama: 'Penanggulangan kemiskinan' },
  { kode: 'BC', nama: 'Penanggulangan bencana' },
];

/** `jenisPenerimaKode` "hibah"/"bansos" = butir umum kelompok itu. */
export const CHECKLIST_AWAL: { jenisPenerimaKode: string; pertanyaan: string; dasar: string }[] = [
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Peruntukan spesifik, terukur, dan berbasis kinerja', dasar: '3.3.1.5 a.5) a)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Value for money, berbasis kebutuhan, bebas konflik kepentingan', dasar: '3.3.1.5 a.5) b)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Tidak untuk belanja operasional (honorarium, perjalanan dinas, ATK, pengeluaran rutin)', dasar: '3.3.1.5 a.4)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Tidak rutin, tidak berulang dalam 1 TA, dan tidak terus-menerus setiap TA', dasar: '3.3.1.5 a.5) d)–e)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Memberi manfaat bagi fungsi pemerintahan, pembangunan, dan kemasyarakatan', dasar: '3.3.1.5 a.5) f)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Aspek legalitas: calon penerima sesuai subjek penerima hibah', dasar: '3.3.1.5 c.3) a)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Aspek administrasi: nama, alamat, besaran, dan tujuan penggunaan sah', dasar: '3.3.1.5 c.3) b)' },
  { jenisPenerimaKode: 'hibah', pertanyaan: 'Mendukung pencapaian sasaran pembangunan daerah', dasar: '3.3.1.5 c.3) c)' },
  { jenisPenerimaKode: 'H01', pertanyaan: 'Wilayah kerja satuan kerja berada di daerah; ada rekomendasi pimpinan; tidak tumpang tindih dengan APBN', dasar: '3.3.1.5 b.1)' },
  { jenisPenerimaKode: 'H04', pertanyaan: 'Hibah untuk meneruskan hibah dari pemerintah pusat dan tidak berbentuk barang', dasar: '3.3.1.5 b.4)' },
  { jenisPenerimaKode: 'H06', pertanyaan: 'Kepengurusan di daerah domisili; keterangan domisili dari lurah/kepala desa; terdaftar minimal 2 tahun; bersedia melapor berkala', dasar: '3.3.1.5 b.6) b)' },
  { jenisPenerimaKode: 'H07', pertanyaan: 'Terdaftar di kementerian hukum; berkedudukan di daerah; sekretariat tetap; terdaftar minimal 2 tahun', dasar: '3.3.1.5 b.6) c)' },
  { jenisPenerimaKode: 'H08', pertanyaan: 'Partai politik mendapat kursi di DPRD; besaran sesuai perolehan suara', dasar: '3.3.1.5 b.7)' },
  { jenisPenerimaKode: 'bansos', pertanyaan: 'Selektif: ditujukan melindungi dari kemungkinan risiko sosial', dasar: '3.3.1.6 a.3) a)' },
  { jenisPenerimaKode: 'bansos', pertanyaan: 'Memiliki identitas kependudukan dan berdomisili di daerah', dasar: '3.3.1.6 a.3) b)' },
  { jenisPenerimaKode: 'bansos', pertanyaan: 'Sementara dan tidak terus-menerus, atau keadaan tertentu yang dapat berkelanjutan', dasar: '3.3.1.6 a.3) c)' },
  { jenisPenerimaKode: 'bansos', pertanyaan: 'Sesuai salah satu dari enam tujuan bansos', dasar: '3.3.1.6 a.3) d)' },
  { jenisPenerimaKode: 'bansos', pertanyaan: 'Aspek legalitas, administrasi, dan dukungan sasaran pembangunan daerah', dasar: '3.3.1.6 c.2) c)' },
];

/** `jenisPenerimaKode` "*" = semua jenis. */
export const BERKAS_WAJIB_AWAL: { jenisPenerimaKode: string; kode: string; nama: string; tingkat: 'penerima' | 'usulan'; sensitif?: boolean }[] = [
  { jenisPenerimaKode: '*', kode: 'proposal', nama: 'Proposal', tingkat: 'usulan' },
  { jenisPenerimaKode: 'H01', kode: 'rekomendasi_satker', nama: 'Rekomendasi pimpinan satuan kerja', tingkat: 'usulan' },
  ...['H03', 'H04', 'H05', 'H07', 'H09'].map((j) => ({ jenisPenerimaKode: j, kode: 'akta', nama: 'Akta pendirian atau pengesahan badan hukum', tingkat: 'penerima' as const })),
  ...['H06', 'H07'].flatMap((j) => [
    { jenisPenerimaKode: j, kode: 'domisili', nama: 'Keterangan domisili dari lurah/kepala desa', tingkat: 'penerima' as const },
    { jenisPenerimaKode: j, kode: 'pengurus', nama: 'Susunan pengurus', tingkat: 'penerima' as const },
  ]),
  { jenisPenerimaKode: 'B01', kode: 'ktp', nama: 'KTP', tingkat: 'penerima', sensitif: true },
  { jenisPenerimaKode: 'B02', kode: 'ktp', nama: 'KTP kepala keluarga', tingkat: 'penerima', sensitif: true },
  { jenisPenerimaKode: 'B02', kode: 'kk', nama: 'Kartu Keluarga', tingkat: 'penerima', sensitif: true },
  { jenisPenerimaKode: 'B03', kode: 'ktp_ketua', nama: 'KTP ketua kelompok', tingkat: 'penerima', sensitif: true },
  { jenisPenerimaKode: 'B03', kode: 'anggota', nama: 'Susunan anggota kelompok', tingkat: 'penerima' },
  { jenisPenerimaKode: 'B04', kode: 'akta', nama: 'Akta pendirian atau surat keterangan terdaftar', tingkat: 'penerima' },
];

/** Muat data awal (idempoten). Mengembalikan jumlah butir baru per master. */
export async function muatDataAwalHibah() {
  await sambung();
  const hasil: Record<string, number> = {};
  const isi = async <T extends Record<string, unknown>>(nama: string, model: { updateOne: (...a: never[]) => Promise<{ upsertedCount: number }> }, data: T[], kunci: (x: T) => Record<string, unknown>) => {
    let n = 0;
    for (const x of data) n += (await (model.updateOne as (f: unknown, u: unknown, o: unknown) => Promise<{ upsertedCount: number }>)(kunci(x), { $setOnInsert: x }, { upsert: true })).upsertedCount;
    hasil[nama] = n;
  };
  await isi('jenisPenerima', HibahJenisPenerima, JENIS_PENERIMA_AWAL.map((j, i) => ({ ...j, bentuk: [...j.bentuk], urutan: i + 1, aktif: true })), (x) => ({ kode: x.kode }));
  await isi('tujuanBansos', HibahTujuanBansos, TUJUAN_BANSOS_AWAL.map((t) => ({ ...t, aktif: true })), (x) => ({ kode: x.kode }));
  await isi('checklist', HibahChecklist, CHECKLIST_AWAL.map((c, i) => ({ ...c, urutan: i + 1, wajib: true, butuhBerkas: false, versi: 1, aktif: true })), (x) => ({ jenisPenerimaKode: x.jenisPenerimaKode, pertanyaan: x.pertanyaan }));
  await isi('berkasWajib', HibahBerkasWajib, BERKAS_WAJIB_AWAL.map((b) => ({ ...b, wajib: true, sensitif: !!b.sensitif, aktif: true })), (x) => ({ jenisPenerimaKode: x.jenisPenerimaKode, kode: x.kode }));
  // rekening hibah (5.1.05) dan bansos (5.1.06) dari master rekening DANBOY; pemetaan ke jenis diatur Admin Perencana
  const rek = await Rekening.find({ kode: { $regex: '^5\\.1\\.0[56]' } }, { kode: 1, nama: 1 }).lean();
  await isi('rekening', HibahRekening, rek.map((r) => ({ kodeRekening: r.kode, nama: r.nama, jenisPenerimaKode: [] as string[], aktif: true })), (x) => ({ kodeRekening: x.kodeRekening }));
  return hasil;
}
