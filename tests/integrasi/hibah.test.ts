import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '@danboy/core';
import * as svc from '@danboy/core/services';
import { teksDocx } from '@danboy/cetak';
import { HibahBeritaAcara, HibahPenerima, HibahUsulan, LogAudit, Skpd, WilayahDesa, WilayahKecamatan, putus, sambung, semuaModel } from '@danboy/db';
import { buatXlsx } from '@danboy/excel';

/*
 * Alur modul Hibah dan Bansos end-to-end, mengikuti kriteria penerimaan AC-01 s.d. AC-11 (TDD bagian Pengujian).
 * Google Drive diganti penyimpanan di memori.
 */

let rs: MongoMemoryReplSet;
const drive = new svc.PenyimpananMemori();
let ap: SessionUser; // Admin Perencana
let vf: SessionUser; // Verifikator TAPD
let opA: SessionUser; // Operator PD A
let opB: SessionUser; // Operator PD B
let pdA: string;
let pdB: string;
const TAHUN = 2027;

const PDF = (isi = 'x') => ({ nama: 'dok.pdf', isi: Buffer.from(`%PDF-1.4\n${isi}\n%%EOF`) });
const hari = (n: number) => new Date(Date.now() + n * 86_400_000);
const muat = async (id: unknown) => (await HibahUsulan.findById(id).lean())!;
const versi = async (id: unknown) => new Date((await muat(id)).updatedAt).toISOString();

async function aturJadwal(ubah: Partial<Record<'input' | 'evaluasi' | 'verifikasi' | 'perbaikan' | 'penetapan', [Date, Date]>> = {}) {
  const dasar = { input: [hari(-30), hari(30)], evaluasi: [hari(-30), hari(30)], verifikasi: [hari(-30), hari(30)], perbaikan: [hari(-30), hari(30)], penetapan: [hari(-30), hari(30)] };
  const j = { ...dasar, ...ubah } as unknown as Record<string, [Date, Date]>;
  await svc.simpanJadwal(ap, TAHUN, { jadwal: Object.entries(j).map(([tahapan, [mulai, selesai]]) => ({ tahapan: tahapan as 'input', mulai, selesai })) });
}

/** Usulan lengkap sampai Evaluasi PD: kartu, usulan dengan rincian, proposal, kirim. */
async function usulanSiapEvaluasi(op: SessionUser, penerimaId: string, rincian = [{ uraian: 'Bahan', spesifikasi: '', volume: 2, satuan: 'paket', hargaSatuan: 1_000_000 }]) {
  const u = await svc.buatUsulan(op, {
    penerimaId, bentuk: 'uang', subkegiatanKode: '1.06.01.2.01.0001', kodeRekening: '5.1.05.05.01.0001', peruntukan: 'Kegiatan sosial', tujuanBansosKode: 'PS',
    proposalNomor: 'P/001', proposalTanggal: new Date(), rincian,
  });
  await svc.terimaBerkas(op, { pemilikJenis: 'usulan', pemilikId: String(u._id), jenisDokumen: 'proposal', ...PDF('proposal') });
  await svc.kirimUsulan(op, String(u._id), { updatedAt: await versi(u._id) });
  return String(u._id);
}

async function evaluasiLayak(op: SessionUser, id: string, rekom?: number[]) {
  const u = await muat(id);
  await svc.simpanEvaluasi(op, id, {
    updatedAt: new Date(u.updatedAt).toISOString(),
    checklist: u.evaluasi.checklist.map((b) => ({ butirId: String(b.butirId), jawaban: 'ya' as const, catatan: '' })),
    rincian: u.rincian.map((r, i) => ({ _id: String(r._id), nilaiRekomendasi: rekom?.[i] ?? r.jumlah, catatanRekomendasi: '' })),
    peringatan: u.peringatan.map((p) => ({ kode: p.kode, catatanOperator: 'Sudah diperiksa' })),
    catatan: '',
  });
  await svc.tetapkanKesimpulan(op, id, { updatedAt: await versi(id), kesimpulan: 'layak' });
}

const aspekSemua = (memenuhi: boolean | null = true) => (['tusi', 'program', 'duplikasi', 'keuangan'] as const).map((kode) => ({ kode, memenuhi, catatan: '' }));

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ launchTimeout: 60_000 }] });
  process.env.MONGODB_URI = rs.getUri('danboy_hibah_uji');
  process.env.KUNCI_ENKRIPSI = randomBytes(32).toString('base64');
  process.env.KUNCI_SIDIK = randomBytes(32).toString('base64');
  await sambung();
  await Promise.all(semuaModel.map((m) => m.syncIndexes()));
  svc.aturPenyimpanan(drive);
  const [a, b] = await Skpd.create([{ kode: '1.06.0.00.0.00.01.0000', nama: 'Dinas Sosial' }, { kode: '2.07.0.00.0.00.01.0000', nama: 'Dinas Koperasi' }]);
  pdA = String(a._id);
  pdB = String(b._id);
  const id = () => randomBytes(12).toString('hex');
  ap = { id: id(), username: 'ap', nama: 'Admin Perencana', peran: null, aksesHibah: 'admin_perencana' };
  vf = { id: id(), username: 'vf', nama: 'Verifikator', peran: null, aksesHibah: 'verifikator' };
  opA = { id: id(), username: 'opa', nama: 'Operator A', peran: 'skpd', skpdId: pdA };
  opB = { id: id(), username: 'opb', nama: 'Operator B', peran: 'skpd', skpdId: pdB };
  await svc.muatDataAwalHibah();
  await svc.simpanMasterHibah(ap, 'rekening', null, { kodeRekening: '5.1.05.05.01.0001', nama: 'Belanja Hibah', jenisPenerimaKode: [] });
  await svc.simpanMasterHibah(ap, 'rekening', null, { kodeRekening: '5.1.06.01.01.0001', nama: 'Belanja Bansos', jenisPenerimaKode: [] });
  await WilayahKecamatan.create({ kode: 'K01', nama: 'Boyolali' });
  await WilayahDesa.create([{ kode: 'D01', nama: 'Siswodipuran', kecamatanKode: 'K01', jenis: 'kelurahan' }, { kode: 'D02', nama: 'Pulisen', kecamatanKode: 'K01', jenis: 'kelurahan' }]);
  await svc.buatTahunHibah(ap, { tahun: TAHUN });
  await aturJadwal();
});

afterAll(async () => {
  svc.aturPenyimpanan(null);
  await putus();
  await rs?.stop();
});

describe('modul Hibah dan Bansos', () => {
  let individuId: string;
  let ormasId: string;

  it('AC-01: kartu Individu ditolak tanpa NIK 16 digit atau tanpa KTP; NIK disimpan terenkripsi', async () => {
    const dasar = { jenisPenerimaKode: 'B01', nama: 'Budi Santoso', alamat: 'Jl. Merbabu 1', kecamatanKode: 'K01', desaKode: 'D01', kontak: '', penanggungJawab: '' };
    await expect(svc.buatPenerima(opA, { ...dasar, identitas: '33091234' }, { ktp: PDF() })).rejects.toMatchObject({ kode: 'VALIDASI' });
    await expect(svc.buatPenerima(opA, { ...dasar, identitas: '3309123412340001' })).rejects.toMatchObject({ kode: 'VALIDASI', detail: { ktp: expect.any(String) } });
    await expect(svc.buatPenerima(opA, { ...dasar, identitas: '3309123412340001' }, { ktp: { nama: 'ktp.txt', isi: Buffer.from('bukan pdf') } })).rejects.toMatchObject({ kode: 'VALIDASI' });
    const p = await svc.buatPenerima(opA, { ...dasar, identitas: '3309123412340001' }, { ktp: PDF('ktp') });
    individuId = String(p!._id);
    const db = (await HibahPenerima.findById(p!._id).lean())!;
    expect(db.identitas?.sandi).toMatch(/^v1:/);
    expect(JSON.stringify(db)).not.toContain('3309123412340001');
    expect(db.identitas?.samaran).toBe('3309••••••••0001');
    // BR-03: identitas sama ditolak, dengan ID kartu yang ada
    await expect(svc.buatPenerima(opB, { ...dasar, nama: 'Budi S', identitas: '3309 1234 1234 0001' }, { ktp: PDF() })).rejects.toMatchObject({ kode: 'DUPLIKAT', detail: { penerimaId: individuId } });
    const cek = await svc.cekDuplikatPenerima(opB, { jenisPenerimaKode: 'B01', identitas: '3309123412340001', nama: 'Budi Santosa', desaKode: 'D01' });
    expect(cek.sama).toBeTruthy();
    expect((cek.mirip as unknown[]).length).toBe(1);
    // Operator PD lain tidak melihat kartu PD lain yang belum punya usulan di PD-nya
    await expect(svc.detailPenerima(opB, individuId)).rejects.toMatchObject({ kode: 'TIDAK_DITEMUKAN' });
    const o = await svc.buatPenerima(opA, { jenisPenerimaKode: 'H07', nama: 'Yayasan Sejahtera Bersama', identitas: 'AHU-0012345.AH.01.04', alamat: '', kecamatanKode: 'K01', desaKode: 'D02', kontak: '', penanggungJawab: 'Siti' });
    ormasId = String(o!._id);
  });

  it('AC-10 (berkas): tersimpan di folder Drive penerima, tanpa tautan publik; KTP hanya untuk yang berhak', async () => {
    const b = [...drive.berkas.values()].find((x) => x.nama.startsWith('ktp_'))!;
    expect(b.jalur).toEqual([`TA ${new Date().getFullYear() + 1}`, 'Dinas Sosial', `Budi Santoso · ${individuId.slice(-6)}`]);
    expect(b.publik).toBe(false);
    const daftar = await svc.daftarBerkas(opA, 'penerima', individuId);
    const ktp = (daftar as unknown as { _id: string; status: string; sensitif: boolean }[])[0];
    expect(ktp).toMatchObject({ status: 'tersimpan', sensitif: true });
    expect((await svc.bukaBerkas(opA, ktp._id)).isi.toString()).toContain('ktp');
    expect((await svc.bukaBerkas(vf, ktp._id)).mime).toBe('application/pdf');
    expect(await LogAudit.countDocuments({ aksi: 'buka_berkas' })).toBe(2);
    await expect(svc.bukaBerkas(ap, ktp._id)).rejects.toMatchObject({ kode: 'TIDAK_DITEMUKAN' });
  });

  it('antrean: Drive gagal → berkas menunggu di GridFS, lalu terkirim oleh fungsi terjadwal', async () => {
    drive.gagal = 99;
    const p = await svc.buatPenerima(opA, { jenisPenerimaKode: 'B01', nama: 'Ani', identitas: '3309123412340002', alamat: '', kecamatanKode: 'K01', desaKode: 'D01', kontak: '', penanggungJawab: '' }, { ktp: PDF('ani') });
    const [b] = (await svc.daftarBerkas(opA, 'penerima', String(p!._id))) as unknown as { status: string }[];
    expect(b.status).toBe('menunggu');
    drive.gagal = 0;
    expect(await svc.kirimBerkasTertunda()).toMatchObject({ terkirim: 1 });
    const [b2] = (await svc.daftarBerkas(opA, 'penerima', String(p!._id))) as unknown as { status: string }[];
    expect(b2.status).toBe('tersimpan');
  }, 60_000);

  let usulanA: string;
  it('AC-03: tiga rincian menghasilkan nilai usulan dan rekomendasi sama dengan jumlah rinciannya; BR-02 dan BR-13', async () => {
    const u = await svc.buatUsulan(opA, {
      penerimaId: ormasId, bentuk: 'uang', subkegiatanKode: '', kodeRekening: '5.1.05.05.01.0001', peruntukan: 'Renovasi sekretariat', tujuanBansosKode: '',
      proposalNomor: 'P/10', proposalTanggal: new Date(),
      rincian: [
        { uraian: 'Semen', spesifikasi: '', volume: 10, satuan: 'sak', hargaSatuan: 65_000 },
        { uraian: 'Cat', spesifikasi: '', volume: 2.5, satuan: 'kaleng', hargaSatuan: 300_001 },
        { uraian: 'Tukang', spesifikasi: '', volume: 5, satuan: 'OH', hargaSatuan: 150_000 },
      ],
    });
    usulanA = String(u._id);
    expect(u.nomor).toBe('HB-2027-0001');
    expect(u.nilaiUsulan).toBe(650_000 + 750_003 + 750_000);
    // BR-13: tanpa subkegiatan dan berkas wajib, tidak bisa dikirim
    await expect(svc.kirimUsulan(opA, usulanA, { updatedAt: await versi(usulanA) })).rejects.toMatchObject({ kode: 'VALIDASI' });
    await svc.ubahUsulan(opA, usulanA, { updatedAt: await versi(usulanA), subkegiatanKode: '1.06.01.2.01.0001' });
    await expect(svc.kirimUsulan(opA, usulanA, { updatedAt: await versi(usulanA) })).rejects.toMatchObject({ detail: { berkas: expect.stringContaining('Proposal') } });
    for (const jd of ['proposal', 'akta', 'domisili', 'pengurus']) {
      await svc.terimaBerkas(opA, { pemilikJenis: jd === 'proposal' ? 'usulan' : 'penerima', pemilikId: jd === 'proposal' ? usulanA : ormasId, jenisDokumen: jd, ...PDF(jd) });
    }
    await svc.kirimUsulan(opA, usulanA, { updatedAt: await versi(usulanA) });
    const x = await muat(usulanA);
    expect(x.status).toBe('evaluasi');
    expect(x.evaluasi.checklist.length).toBeGreaterThan(8);
    // BR-02: rekomendasi per rincian tidak boleh melebihi nilai usulan rincian
    await expect(
      svc.simpanEvaluasi(opA, usulanA, { updatedAt: await versi(usulanA), checklist: [], rincian: [{ _id: String(x.rincian[0]._id), nilaiRekomendasi: 650_001, catatanRekomendasi: '' }], peringatan: [], catatan: '' }),
    ).rejects.toMatchObject({ kode: 'VALIDASI' });
    // konkurensi: versi lama ditolak
    await expect(svc.ubahUsulan(opA, usulanA, { updatedAt: new Date(0).toISOString(), peruntukan: 'x' })).rejects.toMatchObject({ kode: 'DATA_BERUBAH' });
    await evaluasiLayak(opA, usulanA, [600_000, 750_003, 700_000]);
    const y = await muat(usulanA);
    expect(y.status).toBe('layak');
    expect(y.nilaiRekomendasi).toBe(600_000 + 750_003 + 700_000);
  });

  it('AC-02: penerima di riwayat impor TA 2026 memunculkan peringatan; evaluasi tidak selesai tanpa catatan', async () => {
    // impor riwayat: Budi (NIK sama) dan nama mirip di desa yang sama
    const isi = await buatXlsx([
      {
        nama: 'Data',
        kolom: ['TAHUN', 'KELOMPOK', 'JENIS PENERIMA', 'NAMA PENERIMA', 'NIK / NOMOR BADAN HUKUM', 'ALAMAT', 'DESA/KELURAHAN', 'KECAMATAN', 'PERANGKAT DAERAH', 'BENTUK', 'NILAI', 'KETERANGAN'].map((k) => ({ header: k, key: k })),
        baris: [
          { TAHUN: 2026, KELOMPOK: 'BANSOS', 'JENIS PENERIMA': 'B01', 'NAMA PENERIMA': 'Budi Santoso', 'NIK / NOMOR BADAN HUKUM': '3309123412340001', 'DESA/KELURAHAN': 'Siswodipuran', KECAMATAN: 'Boyolali', 'PERANGKAT DAERAH': 'Dinas Sosial', BENTUK: 'UANG', NILAI: 1_000_000 },
          { TAHUN: 2026, KELOMPOK: 'HIBAH', 'JENIS PENERIMA': 'Organisasi kemasyarakatan berbadan hukum', 'NAMA PENERIMA': 'Yayasan Sejahtera Bersama', 'DESA/KELURAHAN': 'Pulisen', KECAMATAN: 'Boyolali', 'PERANGKAT DAERAH': 'Dinas Tak Dikenal', BENTUK: 'UANG', NILAI: 5_000_000 },
          { TAHUN: 2026, KELOMPOK: 'BANSOS', 'NAMA PENERIMA': 'Salah NIK', 'JENIS PENERIMA': 'B01', 'NIK / NOMOR BADAN HUKUM': '123', 'DESA/KELURAHAN': 'Pulisen', KECAMATAN: 'Boyolali', 'PERANGKAT DAERAH': 'Dinas Sosial', BENTUK: 'UANG', NILAI: 1 },
          { TAHUN: 2026, KELOMPOK: 'BANSOS', 'NAMA PENERIMA': 'Desa Asing', 'DESA/KELURAHAN': 'Antah', KECAMATAN: 'Boyolali', 'PERANGKAT DAERAH': 'Dinas Sosial', BENTUK: 'UANG', NILAI: 1 },
        ],
      },
    ]);
    const pr = await svc.pratinjauImporHibah(ap, { jenis: 'riwayat', namaFile: 'riwayat-2026.xlsx', isi });
    expect(pr).toMatchObject({ jumlahDiproses: 2, jumlahDitahan: 2, tahun: 2026 });
    expect(JSON.stringify(pr)).not.toContain('3309123412340001');
    await svc.terapkanImporHibah(ap, String(pr._id));
    // FR-10: impor ulang tahun yang sama mengganti seluruh data tahun itu
    const pr2 = await svc.pratinjauImporHibah(ap, { jenis: 'riwayat', namaFile: 'riwayat-2026.xlsx', isi });
    expect(pr2.jumlahLama).toBe(2);
    expect(await svc.terapkanImporHibah(ap, String(pr2._id))).toMatchObject({ dihapus: 2, disimpan: 2 });

    const id = await usulanSiapEvaluasi(opA, individuId);
    const u = await muat(id);
    expect(u.peringatan.map((p) => p.kode)).toEqual(['RIWAYAT']);
    expect(u.peringatan[0].sumber[0].label).toContain('TA 2026');
    // tanpa catatan atas peringatan, kesimpulan ditolak
    await svc.simpanEvaluasi(opA, id, {
      updatedAt: await versi(id),
      checklist: u.evaluasi.checklist.map((b) => ({ butirId: String(b.butirId), jawaban: 'ya', catatan: '' })),
      rincian: u.rincian.map((r) => ({ _id: String(r._id), nilaiRekomendasi: r.jumlah, catatanRekomendasi: '' })),
      peringatan: [],
      catatan: '',
    });
    await expect(svc.tetapkanKesimpulan(opA, id, { updatedAt: await versi(id), kesimpulan: 'layak' })).rejects.toMatchObject({ detail: { peringatan: expect.any(String) } });
    await evaluasiLayak(opA, id);
    expect((await muat(id)).status).toBe('layak');
    // kartu penerima menampilkan riwayat impor (FR-15)
    const d = await svc.detailPenerima(opA, ormasId);
    expect(d.riwayat[0]).toMatchObject({ tahun: 2026, tingkat: 'kemungkinan' });
  });

  let rekomId: string;
  it('AC-04: satu dokumen rekomendasi berisi tiga usulan; setelah pindaian diunggah ketiganya terkunci', async () => {
    const lain = await usulanSiapEvaluasi(opA, ormasId);
    await evaluasiLayak(opA, lain);
    const layak = (await svc.usulanLayak(opA)) as unknown as { _id: string }[];
    expect(layak).toHaveLength(3);
    // BR-08: usulan PD lain tidak bisa dimasukkan
    const r = await svc.buatRekomendasi(opA, { nomor: '400/12/2026', tanggal: new Date(), perihal: '', kepalaPdNama: 'Drs. Kepala', kepalaPdNip: '1970', usulanIds: layak.map((x) => x._id) });
    rekomId = String(r._id);
    await expect(svc.buatRekomendasi(opB, { nomor: 'x', tanggal: new Date(), perihal: '', kepalaPdNama: '', kepalaPdNip: '', usulanIds: [usulanA] })).rejects.toThrow();
    const docx = await svc.unduhRekomendasi(opA, rekomId);
    const teks = teksDocx(docx.isi);
    expect(teks).toContain('400/12/2026');
    expect(teks).toContain('Yayasan Sejahtera Bersama');
    expect(teks).toContain('2.050.003'); // total rekomendasi usulanA
    expect(teks).toContain('DINAS SOSIAL');
    // batal mengembalikan ke Layak (FR-28), lalu dibuat lagi
    await svc.batalkanRekomendasi(opA, rekomId);
    expect((await muat(usulanA)).status).toBe('layak');
    const r2 = await svc.buatRekomendasi(opA, { nomor: '400/13/2026', tanggal: new Date(), perihal: '', kepalaPdNama: 'Drs. Kepala', kepalaPdNip: '1970', usulanIds: layak.map((x) => x._id) });
    rekomId = String(r2._id);
    await svc.unggahRekomendasi(opA, rekomId, PDF('ttd'));
    for (const x of layak) expect((await muat(x._id)).status).toBe('rekomendasi_diunggah');
    // BR-09: setelah diunggah, PD tidak bisa mengubah
    await expect(svc.ubahUsulan(opA, usulanA, { updatedAt: await versi(usulanA), peruntukan: 'ubah' })).rejects.toMatchObject({ kode: 'VALIDASI' });
    expect([...drive.berkas.values()].some((b) => b.jalur[1] === 'Rekomendasi')).toBe(true);
  });

  it('AC-05 dan AC-06: nilai di atas rekomendasi wajib alasan; ditolak otomatis Rp0', async () => {
    const r = (await svc.detailRekomendasi(opA, rekomId)) as unknown as { usulan: { _id: string }[] };
    const [a, b] = r.usulan.map((x) => x._id).filter((x) => x !== usulanA);
    const u = await muat(usulanA);
    await expect(
      svc.simpanVerifikasi(vf, usulanA, { updatedAt: await versi(usulanA), aspek: aspekSemua(), keputusan: 'disetujui', nilaiDisetujui: u.nilaiRekomendasi + 100_000, alasan: '' }),
    ).rejects.toMatchObject({ detail: { alasan: expect.any(String) } });
    await svc.simpanVerifikasi(vf, usulanA, { updatedAt: await versi(usulanA), aspek: aspekSemua(), keputusan: 'disetujui', nilaiDisetujui: u.nilaiRekomendasi + 100_000, alasan: 'Kebutuhan riil lebih besar' });
    expect(await muat(usulanA)).toMatchObject({ status: 'disetujui', nilaiDisetujui: 2_150_003 });
    await expect(svc.simpanVerifikasi(vf, a, { updatedAt: await versi(a), aspek: aspekSemua(false), keputusan: 'ditolak', nilaiDisetujui: 5_000_000, alasan: '' })).rejects.toMatchObject({ kode: 'VALIDASI' });
    await svc.simpanVerifikasi(vf, a, { updatedAt: await versi(a), aspek: aspekSemua(false), keputusan: 'ditolak', nilaiDisetujui: 5_000_000, alasan: 'Tidak sesuai tugas dan fungsi' });
    expect(await muat(a)).toMatchObject({ status: 'ditolak', nilaiDisetujui: 0 });
    // Operator PD tidak berhak memverifikasi
    await expect(svc.simpanVerifikasi(opA, b, { updatedAt: await versi(b), aspek: aspekSemua(), keputusan: 'disetujui', nilaiDisetujui: 1, alasan: 'x' })).rejects.toMatchObject({ kode: 'TIDAK_BERHAK' });
  });

  it('AC-07: Perbaikan yang mengubah nilai rekomendasi tidak bisa dikirim ulang sebelum masuk dokumen rekomendasi baru', async () => {
    const r = (await svc.detailRekomendasi(opA, rekomId)) as unknown as { usulan: { _id: string; status: string }[] };
    const b = r.usulan.find((x) => x.status === 'rekomendasi_diunggah')!._id;
    await svc.simpanVerifikasi(vf, b, { updatedAt: await versi(b), aspek: aspekSemua(null), keputusan: 'perbaikan', nilaiDisetujui: null, alasan: 'Lengkapi rincian' });
    expect((await muat(b)).status).toBe('perbaikan');
    // hanya berkas diperbaiki: boleh langsung dikirim ulang
    await svc.terimaBerkas(opA, { pemilikJenis: 'usulan', pemilikId: b, jenisDokumen: 'lainnya', ...PDF('perbaikan') });
    await svc.kirimUsulan(opA, b, { updatedAt: await versi(b) });
    expect((await muat(b)).status).toBe('rekomendasi_diunggah');
    // perbaikan kedua: nilai rekomendasi diubah → kembali ke evaluasi, tidak bisa dikirim ulang
    await svc.simpanVerifikasi(vf, b, { updatedAt: await versi(b), aspek: aspekSemua(null), keputusan: 'perbaikan', nilaiDisetujui: null, alasan: 'Turunkan nilai' });
    const u = await muat(b);
    await svc.simpanEvaluasi(opA, b, { updatedAt: await versi(b), checklist: [], rincian: [{ _id: String(u.rincian[0]._id), nilaiRekomendasi: u.rincian[0].jumlah - 500_000, catatanRekomendasi: 'dikurangi' }], peringatan: [], catatan: '' });
    const v = await muat(b);
    expect(v).toMatchObject({ status: 'evaluasi', rekomendasiId: null });
    await expect(svc.kirimUsulan(opA, b, { updatedAt: await versi(b) })).rejects.toThrow();
    // harus layak lalu masuk dokumen rekomendasi baru, diunggah, baru sampai ke TAPD
    await svc.tetapkanKesimpulan(opA, b, { updatedAt: await versi(b), kesimpulan: 'layak' });
    const r2 = await svc.buatRekomendasi(opA, { nomor: '400/14/2026', tanggal: new Date(), perihal: '', kepalaPdNama: 'K', kepalaPdNip: '1', usulanIds: [b] });
    await svc.unggahRekomendasi(opA, String(r2._id), PDF('ttd2'));
    expect((await muat(b)).status).toBe('rekomendasi_diunggah');
    await svc.simpanVerifikasi(vf, b, { updatedAt: await versi(b), aspek: aspekSemua(), keputusan: 'disetujui', nilaiDisetujui: (await muat(b)).nilaiRekomendasi, alasan: '' });
    expect((await muat(b)).riwayatStatus.map((x) => x.status)).toEqual([
      'draf', 'evaluasi', 'layak', 'dalam_rekomendasi', 'layak', 'dalam_rekomendasi', 'rekomendasi_diunggah', 'perbaikan', 'rekomendasi_diunggah', 'perbaikan', 'evaluasi', 'layak', 'dalam_rekomendasi', 'rekomendasi_diunggah', 'disetujui',
    ]);
  });

  it('AC-08: input usulan baru terkunci setelah tahapan Input selesai, kecuali PD yang diberi perpanjangan', async () => {
    await aturJadwal({ input: [hari(-30), hari(-1)] });
    const p = { penerimaId: ormasId, bentuk: 'uang' as const, subkegiatanKode: '', kodeRekening: '', peruntukan: '', tujuanBansosKode: '', proposalNomor: '', rincian: [] };
    await expect(svc.buatUsulan(opA, p)).rejects.toMatchObject({ kode: 'DI_LUAR_JADWAL' });
    await expect(svc.buatUsulan(opB, p)).rejects.toMatchObject({ kode: 'DI_LUAR_JADWAL' });
    await svc.beriPerpanjangan(ap, TAHUN, { tahapan: 'input', skpdId: pdB, selesaiBaru: hari(3), alasan: 'Input susulan' });
    const u = await svc.buatUsulan(opB, p);
    expect(u.status).toBe('draf');
    // BR-05: BUMD tidak boleh berbentuk barang
    const bumd = await svc.buatPenerima(opB, { jenisPenerimaKode: 'H04', nama: 'PDAM', identitas: 'AHU-1', alamat: '', kecamatanKode: '', desaKode: '', kontak: '', penanggungJawab: '' });
    await expect(svc.buatUsulan(opB, { ...p, penerimaId: String(bumd!._id), bentuk: 'barang' })).rejects.toMatchObject({ detail: { bentuk: expect.any(String) } });
    // usulan dobel dengan PD lain memunculkan peringatan DOBEL
    await svc.hapusUsulan(opB, String(u._id));
    await aturJadwal();
  });

  it('AC-09 dan AC-06: Berita Acara dan Lampiran dari hasil terkunci; angkanya sama dengan rekap', async () => {
    await expect(svc.buatBeritaAcara(vf, { tahun: TAHUN, nomor: 'BA/1', tanggal: new Date() })).rejects.toMatchObject({ kode: 'VALIDASI' });
    await svc.kunciHasil(vf, { tahun: TAHUN });
    // setelah dikunci, verifikasi tidak bisa diubah
    await expect(svc.simpanVerifikasi(vf, usulanA, { updatedAt: await versi(usulanA), aspek: aspekSemua(), keputusan: 'ditolak', nilaiDisetujui: 0, alasan: 'x' })).rejects.toMatchObject({ kode: 'TAHAPAN_TERKUNCI' });
    const ba = await svc.buatBeritaAcara(vf, { tahun: TAHUN, nomor: 'BA/001/TAPD/2026', tanggal: new Date('2026-11-19T03:00:00Z') });
    const a = await svc.agregatHasil(TAHUN);
    const rekap = await svc.rekapHibah(ap, TAHUN, 'status');
    const disetujuiRekap = (rekap.baris as { kunci: string; nilaiDisetujui: number }[]).find((x) => x.kunci === 'disetujui')!.nilaiDisetujui;
    expect(a.rekap.reduce((s, r) => s + r.nilaiDisetujui, 0)).toBe(disetujuiRekap);
    const isiBa = teksDocx((await svc.unduhBeritaAcara(vf, String(ba._id), 'ba')).isi);
    expect(isiBa).toContain('BA/001/TAPD/2026');
    expect(isiBa).toContain('Kamis, 19 November 2026');
    expect(isiBa).toContain(new Intl.NumberFormat('id-ID').format(disetujuiRekap));
    expect(isiBa).not.toContain('32 Tahun 2011');
    const l1 = teksDocx((await svc.unduhBeritaAcara(vf, String(ba._id), 'lampiran-1')).isi);
    const l2 = teksDocx((await svc.unduhBeritaAcara(vf, String(ba._id), 'lampiran-2')).isi);
    expect(l1).toContain('Kebutuhan riil lebih besar');
    // usulan yang ditolak tercantum di lampiran dengan alasannya dan nilai Rp0 (AC-06)
    expect(l1 + l2).toContain('Tidak sesuai tugas dan fungsi');
    expect(l1 + l2).toContain('TM');
    const l3a = await svc.eksporLampiranPerkada(vf, TAHUN, '3a');
    expect(l3a.isi.length).toBeGreaterThan(1000);
    // buka kunci oleh Admin Perencana: wajib alasan, BA menjadi usang
    await svc.bukaKunci(ap, { tahun: TAHUN, alasan: 'Koreksi nilai' });
    expect((await HibahBeritaAcara.findById(ba._id).lean())!.status).toBe('usang');
    await expect(svc.unduhBeritaAcara(vf, String(ba._id), 'ba')).rejects.toMatchObject({ kode: 'VALIDASI' });
  });

  it('AC-11: perubahan status dan nilai tercatat di audit dengan nilai lama dan baru; rahasia tersamar', async () => {
    const log = await LogAudit.find({ koleksi: 'hibah_usulan', dokumenId: (await muat(usulanA))._id, aksi: 'ubah' }).lean();
    const status = log.find((l) => (l.sesudah as { status?: string })?.status === 'disetujui');
    expect(status?.sebelum).toMatchObject({ status: 'rekomendasi_diunggah' });
    expect(log.some((l) => 'nilaiDisetujui' in (l.sesudah ?? {}))).toBe(true);
    const p = await LogAudit.findOne({ koleksi: 'hibah_penerima', aksi: 'buat' }).lean();
    expect(JSON.stringify(p)).toContain('(rahasia)');
    expect(JSON.stringify(await LogAudit.find({ koleksi: 'hibah_penerima' }).lean())).not.toMatch(/v1:[A-Za-z0-9+/=]+:/);
    expect(await LogAudit.countDocuments({ aksi: 'impor_riwayat' })).toBe(2);
  });

  it('dashboard, progres, dan pencarian sesuai cakupan peran', async () => {
    const d = await svc.dashboardHibah(opA);
    expect(d.tahun).toBe(TAHUN);
    const prog = await svc.progresPd(ap);
    expect((prog.baris as { namaPd: string }[]).map((x) => x.namaPd)).toContain('Dinas Sosial');
    expect(((await svc.cariHibah(opA, 'Budi')) as unknown[]).length).toBeGreaterThan(0);
    expect(await svc.cariHibah(opB, 'Budi')).toEqual([]);
    const tpl = await svc.unggahTemplat(opA, { jenis: 'rekomendasi', nama: 'kop.docx', isi: (await svc.unduhTemplat(opA, 'rekomendasi', true)).isi });
    expect(tpl).toMatchObject({ versi: 1 });
    await expect(svc.unggahTemplat(opA, { jenis: 'berita_acara', nama: 'ba.docx', isi: Buffer.from('x') })).rejects.toMatchObject({ kode: 'TIDAK_BERHAK' });
  });
});
