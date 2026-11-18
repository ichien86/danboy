import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionUser } from '@danboy/core';
import * as svc from '@danboy/core/services';
import {
  HasilBanding,
  ImporBatch,
  LogAudit,
  Notifikasi,
  Skpd,
  SubkegiatanTahapan,
  SumberDana,
  Tahapan,
  User,
  putus,
  sambung,
  semuaModel,
} from '@danboy/db';

const FIX = join(__dirname, '..', 'fixtures');
const baca = (f: string) => readFileSync(join(FIX, f));
const TOTAL_PAGU_FILE = 4_733_000_000;

let rs: MongoMemoryReplSet;
let sa: SessionUser;
let admin: SessionUser;
let tahapanId: string;

async function unggahDanTunggu(user: SessionUser, input: Parameters<typeof svc.unggahImpor>[1]) {
  const b = await svc.unggahImpor(user, input);
  await svc.tungguJobLokal();
  return (await ImporBatch.findById(b._id).lean())!;
}
async function terapkan(user: SessionUser, batchId: unknown) {
  await svc.terapkanImpor(user, String(batchId), { konfirmasi: true });
  await svc.tungguJobLokal();
  return (await ImporBatch.findById(batchId).lean())!;
}
const ubahCsv = (fn: (baris: string[]) => string[]) => {
  const [h, ...b] = baca('apbd-2027-kecil.csv').toString('utf8').trim().split(/\r?\n/);
  return Buffer.from([h, ...fn(b)].join('\n'));
};

/**
 * Hitung ulang notifikasi sebagian (sesudah perubahan kecil) harus sama dengan hitung ulang penuh:
 * notifikasi terbuka sebelum dan sesudah segarkanNotifikasi penuh tidak boleh berbeda.
 */
async function cekSamaDenganPenuh(tId: string) {
  const ambil = async () =>
    (await Notifikasi.find({ tahapanId: tId, status: 'terbuka' }).select('kunciUnik pesan').lean()).map((n) => `${n.kunciUnik}|${n.pesan}`).sort();
  const sebelum = await ambil();
  await svc.segarkanNotifikasi(tId);
  expect(await ambil()).toEqual(sebelum);
  return sebelum;
}

beforeAll(async () => {
  // batas waktu mulai diperlonggar: di Windows mongod kadang lambat menyala (antivirus, beban mesin)
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ launchTimeout: 60_000 }] });
  process.env.MONGODB_URI = rs.getUri('danboy_uji');
  delete process.env.REDIS_URL;
  await sambung();
  await Promise.all(semuaModel.map((m) => m.syncIndexes()));
  const u = await User.create({ username: 'sa', nama: 'Super Admin', peran: 'super_admin', passwordHash: await svc.hashSandi('Rahasia12345') });
  sa = { id: String(u._id), username: 'sa', nama: 'Super Admin', peran: 'super_admin' };
  const a = await User.create({ username: 'admin', nama: 'Admin', peran: 'admin', passwordHash: await svc.hashSandi('Rahasia12345') });
  admin = { id: String(a._id), username: 'admin', nama: 'Admin', peran: 'admin' };
});

afterAll(async () => {
  await putus();
  await rs?.stop();
});

describe('alur impor end-to-end (service + model)', () => {
  it('impor master sumber dana, nomenklatur, tagging', async () => {
    let b = await unggahDanTunggu(admin, { jenis: 'sumber_dana', namaFile: 'sumber-dana.csv', isi: baca('sumber-dana.csv') });
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.baru).toBe(7);
    b = await terapkan(admin, b._id);
    expect(b.status).toBe('diterapkan');
    expect(await SumberDana.countDocuments()).toBe(7);
    const sg = await SumberDana.findOneAndUpdate({ kode: '1.2.01.08.01' }, { $set: { khusus: true, namaTagging: 'DAU SG Pendidikan' } }, { new: true });
    await SumberDana.updateOne({ kode: '1.2.01.08.02' }, { $set: { khusus: true, namaTagging: 'DAU SG Kesehatan' } });
    expect(sg?.indukKode).toBe('1.2.01.08');

    // nomenklatur: kewenangan Super Admin; Admin Keuangan ditolak mengunggah maupun menerapkan
    const isiNomen = { jenis: 'nomenklatur' as const, namaFile: 'nomenklatur.csv', versi: '900.1-861-2026', isi: baca('nomenklatur.csv') };
    await expect(svc.unggahImpor(admin, isiNomen)).rejects.toMatchObject({ http: 403 });
    b = await unggahDanTunggu(sa, isiNomen);
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.perJenis).toEqual({ urusan: 3, bidang: 4, program: 4, kegiatan: 5, subkegiatan: 8 });
    await expect(svc.terapkanImpor(admin, String(b._id))).rejects.toMatchObject({ http: 403 });
    await terapkan(sa, b._id);

    // nomenklatur bisa ditambah/diubah manual oleh Super Admin; induk harus sudah ada
    await expect(svc.buatNomenklatur(admin, { jenis: 'subkegiatan', kode: '1.01.02.2.01.0002', nama: 'X' })).rejects.toMatchObject({ http: 403 });
    await expect(svc.buatNomenklatur(sa, { jenis: 'subkegiatan', kode: '9.99.99.2.01.0001', nama: 'Tanpa induk' })).rejects.toMatchObject({ http: 400 });
    const nBaru = await svc.buatNomenklatur(sa, { jenis: 'subkegiatan', kode: '01.01.02.2.01.0002', nama: 'Rehabilitasi Sekolah' });
    expect(nBaru).toMatchObject({ kode: '1.01.02.2.01.0002', indukKode: '1.01.02.2.01', versi: '900.1-861-2026', aktif: true });
    await expect(svc.buatNomenklatur(sa, { jenis: 'subkegiatan', kode: '1.01.02.2.01.0002', nama: 'Ganda' })).rejects.toMatchObject({ http: 400 });
    expect(await svc.ubahNomenklatur(sa, String(nBaru._id), { nama: 'Rehabilitasi Sekolah Dasar' })).toMatchObject({ nama: 'Rehabilitasi Sekolah Dasar' });
    await svc.ubahNomenklatur(sa, String(nBaru._id), { aktif: false });

    // rekening: Admin Keuangan
    const rek = await svc.buatRekening(admin, { kode: '5.1.02.01.01.0026', nama: 'Belanja Alat Tulis Kantor' });
    expect((await svc.ubahRekening(admin, String(rek._id), { nama: 'Belanja ATK' })).nama).toBe('Belanja ATK');
    await expect(svc.buatRekening(admin, { kode: '5.1.02.01.01.0026', nama: 'Ganda' })).rejects.toMatchObject({ http: 400 });
    expect((await svc.daftarRekening(admin, { q: '5.1.02' })).total).toBe(1);

    // perangkat daerah: kewenangan Super Admin; sumber dana: Admin Keuangan
    await expect(svc.buatSkpd(admin, { kode: '9.99', nama: 'Uji' })).rejects.toMatchObject({ http: 403 });
    await expect(svc.ubahSumberDana(admin, String(sg!._id), { namaTagging: 'DAU SG Pendidikan' })).resolves.toBeTruthy();

    // perangkat daerah: impor terpisah oleh Super Admin (file ekspor APBD SIPD bisa dipakai langsung)
    await expect(svc.unggahImpor(admin, { jenis: 'skpd', namaFile: 'pd.csv', isi: baca('apbd-2027-kecil.csv') })).rejects.toMatchObject({ http: 403 });
    b = await unggahDanTunggu(sa, { jenis: 'skpd', namaFile: 'perangkat-daerah.csv', isi: baca('apbd-2027-kecil.csv') });
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan).toMatchObject({ jumlahSkpd: 3, jumlahSubUnit: 4, baru: 7 });
    await terapkan(sa, b._id);
    expect(await Skpd.countDocuments()).toBe(3);

    b = await unggahDanTunggu(admin, { jenis: 'tagging', tahun: 2027, namaFile: 'tagging.csv', isi: baca('tagging.csv') });
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.belumDipetakan).toEqual(['DAU SG Pekerjaan Umum']);
    expect(b.ringkasan.baru).toBe(3);
    // tagging untuk subkegiatan yang tidak ada di master nomenklatur ditahan
    expect(b.ringkasan.subkegiatanTidakAda).toEqual(['1.01.02.2.02.0099', '1.03.10.2.01.0021']);
    expect(b.ringkasan.ditahan).toBe(2);
    await expect(
      svc.buatTagging(admin, { tahun: 2027, sumberDanaId: String(sg!._id), kodeSubkegiatan: '1.01.02.2.02.0099', kategori: '', rincian: 'x' }),
    ).rejects.toMatchObject({ http: 400 });
    await terapkan(admin, b._id);
  });

  it('impor ulang data master yang sama: hanya baru/berubah yang diproses', async () => {
    const { Nomenklatur, SumberDana: SD, Tagging } = await import('@danboy/db');
    // sumber dana: file sama -> semua sama, tidak ada yang ditulis ulang
    const sdSebelum = JSON.stringify(await SD.find().sort({ kode: 1 }).lean());
    let b = await unggahDanTunggu(admin, { jenis: 'sumber_dana', namaFile: 'sumber-dana.csv', isi: baca('sumber-dana.csv') });
    expect(b.ringkasan).toMatchObject({ baru: 0, berubahNama: 0, sama: 7, diproses: 0 });
    await terapkan(admin, b._id);
    expect(JSON.stringify(await SD.find().sort({ kode: 1 }).lean())).toBe(sdSebelum);

    // nomenklatur versi yang sama -> semua sama, tidak ada yang ditulis ulang
    const nSebelum = JSON.stringify(await Nomenklatur.find({ aktif: true }).sort({ kode: 1 }).lean());
    b = await unggahDanTunggu(sa, { jenis: 'nomenklatur', namaFile: 'nomenklatur.csv', versi: '900.1-861-2026', isi: baca('nomenklatur.csv') });
    expect(b.ringkasan).toMatchObject({ baru: 0, berubahNama: 0, pindahVersi: 0, diproses: 0 });
    expect(b.ringkasan.sama).toBe(b.ringkasan.jumlah);
    const pratinjau = await svc.statusImpor(sa, String(b._id), { bagian: 'diproses' });
    expect(pratinjau.total).toBe(0);
    await terapkan(sa, b._id);
    expect(JSON.stringify(await Nomenklatur.find({ aktif: true }).sort({ kode: 1 }).lean())).toBe(nSebelum);

    // tagging: kategori berubah -> terdeteksi "berubah" dan diperbarui; baris lain sama
    const tagBaru = baca('tagging.csv').toString('utf8').replace('Kesehatan › Upaya Kesehatan', 'Kesehatan › Upaya Kesehatan Masyarakat');
    b = await unggahDanTunggu(admin, { jenis: 'tagging', tahun: 2027, namaFile: 'tagging-2.csv', isi: Buffer.from(tagBaru) });
    expect(b.ringkasan).toMatchObject({ baru: 0, berubah: 1, sama: 2, diproses: 1 });
    expect((await svc.statusImpor(admin, String(b._id), { bagian: 'diproses' })).total).toBe(1);
    await terapkan(admin, b._id);
    expect(await Tagging.exists({ tahun: 2027, kategori: 'Kesehatan › Upaya Kesehatan Masyarakat' })).toBeTruthy();
  });

  it('tahapan draf menolak impor (R10 / 423)', async () => {
    const t = await svc.buatTahapan(sa, {
      tahun: 2027,
      jenis: 'APBD',
      jadwalMulai: new Date(Date.now() + 86400_000),
      jadwalSelesai: new Date(Date.now() + 30 * 86400_000),
    });
    tahapanId = String(t._id);
    await expect(svc.unggahImpor(admin, { jenis: 'apbd', tahapanId, namaFile: 'a.csv', isi: baca('apbd-2027-kecil.csv') })).rejects.toMatchObject({
      kode: 'TAHAPAN_TERKUNCI',
      http: 423,
    });
    await svc.bukaTahapan(sa, tahapanId);
    await svc.tungguJobLokal();
    expect((await Tahapan.findById(tahapanId).lean())!.status).toBe('terbuka');
  });

  it('impor APBD: pratinjau tidak mengubah data, terapkan menyimpan; total pagu sama persis', async () => {
    const b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId, namaFile: 'apbd-2027-kecil.csv', isi: baca('apbd-2027-kecil.csv') });
    expect(b.galat).toBeNull();
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.barisOk).toBe(13);
    expect(b.ringkasan.totalPaguFile).toBe(TOTAL_PAGU_FILE);
    expect((b.ringkasan.operasi as Record<string, number>).tambah).toBe(7);
    expect(await Skpd.countDocuments()).toBe(3);
    expect(await SubkegiatanTahapan.countDocuments()).toBe(0);

    const hasil = await terapkan(admin, b._id);
    expect(hasil.status).toBe('diterapkan');
    expect(await SubkegiatanTahapan.countDocuments({ tahapanId })).toBe(7);
    const rekap = await svc.rekapSumberDana(admin, tahapanId);
    expect(rekap.total.terpakai).toBe(TOTAL_PAGU_FILE);
    const smp = await SubkegiatanTahapan.findOne({ kodeSubkegiatan: '1.01.02.2.02.0025' }).lean();
    expect(smp!.alokasi).toHaveLength(2);
    expect(smp!.pagu).toBe(350_000_000);
    expect(smp!.seimbang).toBe(true);
    expect(await LogAudit.countDocuments({ aksi: 'terapkan_impor' })).toBeGreaterThan(0);
  });

  it('impor ulang file yang sama menghasilkan nol operasi', async () => {
    const b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId, namaFile: 'apbd-2027-kecil.csv', isi: baca('apbd-2027-kecil.csv') });
    expect(b.ringkasan.tidakAdaPerubahan).toBe(true);
    // isi sama, file berbeda (urutan baris berbeda) -> tetap nol operasi lewat mesin pembanding
    const b2 = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId, namaFile: 'dibalik.csv', isi: ubahCsv((r) => [...r].reverse()) });
    expect(b2.status).toBe('pratinjau');
    expect(b2.ringkasan.operasi).toEqual({ tambah: 0, ubah: 0, tandai_hilang: 0 });
    await svc.batalImpor(admin, String(b2._id));
  });

  it('R2 ganti sumber dana + keputusan Ikut SIPD; R9 kode asing ditahan', async () => {
    const isi = ubahCsv((r) =>
      r
        .map((x) => (x.includes('Seragam SD') ? x.replace('1.2.01.01.01,Dana Alokasi Umum (DAU)', '1.1.01,Pendapatan Asli Daerah (PAD)') : x))
        .concat(
          '2027,1,X,01.01,X,1.01.2.22.0.00.01.0000,Dinas Pendidikan dan Kebudayaan,1.01.2.22.0.00.01.0001,Dinas Pendidikan dan Kebudayaan,01.01.02,X,1.01.02.2.01,X,1.01.02.2.01.0099,Subkegiatan Asing,1.2.01.01.01,DAU,5.1,X,P,X,p,1,1,"1.000"',
        ),
    );
    const b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId, namaFile: 'ganti.csv', isi });
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.barisDitahan).toBe(1);
    expect((b.ringkasan.rujukanHilang as { subkegiatan: { kode: string }[] }).subkegiatan.map((x) => x.kode)).toEqual(['1.01.02.2.01.0099']);
    expect((b.ringkasan.temuan as Record<string, number>).R2).toBe(1);
    expect(await Notifikasi.countDocuments({ aturan: 'R9', status: 'terbuka' })).toBe(1);
    // ada baris ditahan: terapkan wajib dikonfirmasi
    await expect(svc.terapkanImpor(admin, String(b._id))).rejects.toMatchObject({ kode: 'PERLU_KONFIRMASI', http: 409 });
    await terapkan(admin, b._id);

    const beda = await svc.daftarPerbedaan(admin, tahapanId, {});
    expect(beda.total).toBe(1);
    expect(await Notifikasi.countDocuments({ aturan: 'R2', status: 'terbuka' })).toBe(1);
    await svc.ikutSipd(admin, String(beda.data[0]._id));
    const d = await SubkegiatanTahapan.findById(beda.data[0]._id).lean();
    expect(d!.beda.ada).toBe(false);
    expect(d!.beda.diputuskan).toBe('ikut_sipd');
    expect(await Notifikasi.countDocuments({ aturan: 'R2', status: 'terbuka' })).toBe(0);
  });

  it('ubah alokasi: konkurensi optimistis, R4, R3 tanpa mengunci', async () => {
    const d = (await SubkegiatanTahapan.findOne({ kodeSubkegiatan: '2.07.04.2.01.0001' }).lean())!;
    const dau = (await SumberDana.findOne({ kode: '1.2.01.01.01' }).lean())!;
    await svc.simpanPaguSumberDana(admin, tahapanId, [{ sumberDanaId: String(dau._id), nilai: 100_000_000 }]);
    const r = await svc.ubahAlokasi(admin, String(d._id), {
      updatedAt: new Date(d.updatedAt).toISOString(),
      alokasi: [{ sumberDanaId: String(dau._id), nilai: 50_000_000 }],
    });
    expect(r.dokumen.seimbang).toBe(false);
    expect(r.peringatan[0]).toMatchObject({ sumberDana: 'Dana Alokasi Umum (DAU)' });
    expect(await Notifikasi.countDocuments({ aturan: 'R4', status: 'terbuka' })).toBe(1);
    expect(await Notifikasi.countDocuments({ aturan: 'R3', status: 'terbuka' })).toBe(1);
    await cekSamaDenganPenuh(tahapanId);
    await expect(
      svc.ubahAlokasi(admin, String(d._id), { updatedAt: new Date(d.updatedAt).toISOString(), alokasi: [] }),
    ).rejects.toMatchObject({ kode: 'DATA_BERUBAH' });
  });

  it('akun SKPD tidak bisa membaca atau mengubah data SKPD lain', async () => {
    const dinkes = (await Skpd.findOne({ kode: '1.02.0.00.0.00.01.0000' }).lean())!;
    const skpd: SessionUser = { id: admin.id, username: 'dinkes', nama: 'Dinkes', peran: 'skpd', skpdId: String(dinkes._id) };
    const daftar = await svc.daftarSubkegiatan(skpd, tahapanId, {});
    expect(daftar.total).toBe(2);
    expect((daftar.data as unknown as { skpdId: { _id: string } }[]).every((x) => String(x.skpdId._id) === String(dinkes._id))).toBe(true);
    const lain = (await SubkegiatanTahapan.findOne({ skpdId: { $ne: dinkes._id } }).lean())!;
    await expect(svc.detailSubkegiatan(skpd, String(lain._id))).rejects.toMatchObject({ http: 404 });
    await expect(
      svc.ubahAlokasi(skpd, String(lain._id), { updatedAt: new Date().toISOString(), alokasi: [] }),
    ).rejects.toMatchObject({ http: 403 });
    await expect(svc.unggahImpor(skpd, { jenis: 'apbd', tahapanId, namaFile: 'a.csv', isi: Buffer.from('x') })).rejects.toMatchObject({ http: 403 });
    const rekap = await svc.rekapSumberDana(skpd, tahapanId);
    expect(rekap.baris.every((b) => b.terpakaiSkpd !== undefined)).toBe(true);
  });

  it('kegagalan di tengah job terapkan meninggalkan data persis seperti sebelum impor', async () => {
    const sebelum = await SubkegiatanTahapan.find({ tahapanId }).sort({ _id: 1 }).lean();
    const isi = ubahCsv((r) => r.map((x) => x.replace('"1.500.000.000","1.500.000.000"', '"1.600.000.000","1.600.000.000"').replace('"95.500.000","95.500.000"', '"99.000.000","99.000.000"')));
    const b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId, namaFile: 'gagal.csv', isi });
    expect(b.status).toBe('pratinjau');
    await expect(svc.terapkanApbd(String(b._id), { gagalkanSetelah: 1 })).rejects.toThrow('Simulasi');
    const sesudah = await SubkegiatanTahapan.find({ tahapanId }).sort({ _id: 1 }).lean();
    expect(JSON.stringify(sesudah)).toBe(JSON.stringify(sebelum));
    expect((await ImporBatch.findById(b._id).lean())!.status).toBe('gagal');
  });

  it('mutasi pada tahapan ditutup selalu ditolak 423; tahapan baru menyalin data', async () => {
    const d = (await SubkegiatanTahapan.findOne({ tahapanId }).lean())!;
    await svc.tutupTahapan(sa, tahapanId);
    await expect(
      svc.ubahAlokasi(admin, String(d._id), { updatedAt: new Date(d.updatedAt).toISOString(), alokasi: [] }),
    ).rejects.toMatchObject({ http: 423 });
    await expect(svc.ikutSipd(admin, String(d._id))).rejects.toMatchObject({ http: 423 });
    await expect(svc.simpanPaguSumberDana(admin, tahapanId, [])).rejects.toMatchObject({ http: 423 });

    const p = await svc.buatTahapan(sa, {
      tahun: 2027,
      jenis: 'PERGESERAN',
      jadwalMulai: new Date(Date.now() - 1000),
      jadwalSelesai: new Date(Date.now() + 86400_000),
    });
    expect(p.nama).toBe('Pergeseran I 2027');
    const hasil = await svc.jalankanJadwal();
    expect(hasil.dibuka).toBe(1);
    const baru = (await Tahapan.findById(p._id).lean())!;
    expect(baru.status).toBe('terbuka');
    expect(String(baru.disalinDari)).toBe(tahapanId);
    expect(await SubkegiatanTahapan.countDocuments({ tahapanId: p._id })).toBe(await SubkegiatanTahapan.countDocuments({ tahapanId }));
  });

  it('login: kunci 15 menit setelah 5 kali gagal', async () => {
    for (let i = 0; i < 4; i++) expect((await svc.verifikasiLogin('admin', 'salah')).alasan).toBe('salah');
    const r = await svc.verifikasiLogin('admin', 'salah');
    expect(r.alasan).toBe('terkunci');
    expect((await svc.verifikasiLogin('admin', 'Rahasia12345')).alasan).toBe('terkunci');
    expect((await svc.verifikasiLogin('sa', 'Rahasia12345')).ok).toBe(true);
  });

  it('verifikasi SIPD: aplikasi jadi acuan, data tidak berubah, bisa pada tahapan ditutup, notifikasi per SKPD', async () => {
    // Kondisi aplikasi saat ini: Seragam SD (1.01.02.2.01.0025) sudah Ikut SIPD -> PAD; pelatihan (2.07...) diedit Admin -> DAU 50 jt.
    const isi = ubahCsv((r) =>
      r
        .filter((x) => !x.includes('2.07.04.2.01.0001'))
        .map((x) => (x.includes('Alkes RSUD') ? x.replace('"780.000.000","780.000.000"', '"800.000.000","800.000.000"') : x))
        .concat(
          '2027,1,X,01.01,X,1.01.2.22.0.00.01.0000,Dinas Pendidikan dan Kebudayaan,1.01.2.22.0.00.01.0001,Dinas Pendidikan dan Kebudayaan,01.01.02,X,1.01.02.2.01,X,1.01.02.2.01.0099,Subkegiatan Baru di SIPD,1.2.01.01.01,DAU,5.1,X,P,X,p,1,1,"5.000"',
        ),
    );
    const sebelum = await SubkegiatanTahapan.find({ tahapanId }).sort({ _id: 1 }).lean();
    expect((await Tahapan.findById(tahapanId).lean())!.status).toBe('ditutup');
    const b = await unggahDanTunggu(admin, { jenis: 'verifikasi', tahapanId, namaFile: 'cek-sipd.csv', isi });
    expect(b.galat).toBeNull();
    expect(b.status).toBe('selesai');
    expect(b.ringkasan.perStatus).toEqual({ sesuai: 4, nilai_berbeda: 1, sumber_dana_berbeda: 1, tidak_ada_di_sipd: 1, tidak_ada_di_aplikasi: 1 });
    expect(JSON.stringify(await SubkegiatanTahapan.find({ tahapanId }).sort({ _id: 1 }).lean())).toBe(JSON.stringify(sebelum));

    const r = await svc.hasilVerifikasi(admin, String(b._id), { status: 'sumber_dana_berbeda' });
    expect(r.data).toHaveLength(1);
    const v = r.data[0].verifikasi as unknown as { rincianSalah?: unknown; baris: { kodeSumberDana: string; selisih: number }[] };
    expect(r.data[0].kodeSubkegiatan).toBe('1.01.02.2.01.0025');
    // baris rekening tidak disimpan; cukup selisih per sumber dana
    expect(v.rincianSalah).toBeUndefined();
    expect(v.baris.some((x) => x.kodeSumberDana === '1.2.01.01.01' && x.selisih === 350_000_000)).toBe(true);
    const nilai = await svc.hasilVerifikasi(admin, String(b._id), { status: 'nilai_berbeda' });
    expect((nilai.data[0].verifikasi as unknown as { baris: { selisih: number }[] }).baris.map((x) => x.selisih)).toContain(20_000_000);

    // notifikasi VS per SKPD bermasalah (Disdik, Dinkes, Disnaker)
    expect(await Notifikasi.countDocuments({ aturan: 'VS', status: 'terbuka' })).toBe(3);

    // akun SKPD hanya melihat hasil SKPD-nya
    const dinkes = (await Skpd.findOne({ kode: '1.02.0.00.0.00.01.0000' }).lean())!;
    const skpd: SessionUser = { id: admin.id, username: 'dinkes', nama: 'Dinkes', peran: 'skpd', skpdId: String(dinkes._id) };
    const milik = await svc.hasilVerifikasi(skpd, String(b._id), {});
    expect(milik.total).toBe(2);
    expect((milik.batch.ringkasan as { perSkpd: unknown[] }).perSkpd).toHaveLength(1);
    await expect(svc.unggahImpor(skpd, { jenis: 'verifikasi', tahapanId, namaFile: 'a.csv', isi })).rejects.toMatchObject({ http: 403 });

    // centang pengingat "sudah disesuaikan di SIPD" oleh SKPD
    const belum = await svc.hasilVerifikasi(skpd, String(b._id), { status: 'tidak_sesuai', tandai: 'belum' });
    expect(belum.total).toBe(1);
    const lain = await HasilBanding.findOne({ batchId: b._id, aturan: { $ne: 'sesuai' }, skpdId: { $ne: dinkes._id } }).lean();
    await expect(svc.tandaiHasilVerifikasi(skpd, String(b._id), String(lain!._id), true)).rejects.toMatchObject({ http: 404 });
    const t1 = await svc.tandaiHasilVerifikasi(skpd, String(b._id), String(belum.data[0]._id), true);
    expect(t1.progres).toMatchObject({ tidakSesuai: 1, ditandai: 1, sisa: 0 });
    expect((await svc.hasilVerifikasi(skpd, String(b._id), { status: 'tidak_sesuai', tandai: 'belum' })).total).toBe(0);
    const kunciDinkes = `VS:${tahapanId}:${dinkes._id}`;
    expect(await Notifikasi.countDocuments({ kunciUnik: kunciDinkes, status: 'terbuka' })).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'VS', status: 'terbuka' })).toBe(2);
    expect(await LogAudit.countDocuments({ aksi: 'tandai_sudah_disesuaikan_sipd' })).toBe(1);
    // batal centang membuka lagi pengingatnya
    await svc.tandaiHasilVerifikasi(skpd, String(b._id), String(belum.data[0]._id), false);
    const n = await Notifikasi.findOne({ kunciUnik: kunciDinkes, status: 'terbuka' }).lean();
    expect(n?.pesan).toMatch(/^1 subkegiatan Dinas Kesehatan belum sama sumber dananya/);
    // centang lagi; "Cek ulang" batch yang sama mempertahankan centang karena temuannya tidak berubah
    await svc.tandaiHasilVerifikasi(skpd, String(b._id), String(belum.data[0]._id), true);
    await svc.prosesUlangImpor(admin, String(b._id));
    await svc.tungguJobLokal();
    expect((await svc.hasilVerifikasi(skpd, String(b._id), { status: 'tidak_sesuai', tandai: 'sudah' })).total).toBe(1);
    expect(await Notifikasi.countDocuments({ kunciUnik: kunciDinkes, status: 'terbuka' })).toBe(0);

    // verifikasi ulang dengan file yang sesuai menutup notifikasi VS
    const sesuai = ubahCsv((r) =>
      r.map((x) => (x.includes('Seragam SD') ? x.replace('1.2.01.01.01,Dana Alokasi Umum (DAU)', '1.1.01,Pendapatan Asli Daerah (PAD)') : x)).filter((x) => !x.includes('2.07.04.2.01.0001')),
    );
    const b2 = await unggahDanTunggu(admin, { jenis: 'verifikasi', tahapanId, namaFile: 'cek-2.csv', isi: sesuai });
    expect((b2.ringkasan.perStatus as Record<string, number>).sumber_dana_berbeda).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'VS', status: 'terbuka' })).toBe(1); // hanya Disnaker (tidak ada di SIPD)

    // hanya hasil terbaru yang disimpan: batch pertama beserta hasil dan notifikasinya dibuang
    expect(await ImporBatch.exists({ _id: b._id })).toBeNull();
    expect(await HasilBanding.countDocuments({ batchId: b._id })).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'VS', batchId: b._id })).toBe(0);
    const daftar = await svc.daftarVerifikasi(admin, tahapanId);
    expect(daftar.data.map((d) => String(d._id))).toEqual([String(b2._id)]);
    expect(await Notifikasi.countDocuments({ aturan: 'VS', status: 'terbuka', batchId: b2._id })).toBe(1);

    const x = await svc.eksporVerifikasi(admin, String(b2._id));
    expect(x.isi.readUInt32LE(0)).toBe(0x04034b50);

    // judul tersimpan; hapus manual membuang hasil dan notifikasinya
    const b3 = await unggahDanTunggu(admin, { jenis: 'verifikasi', tahapanId, namaFile: 'cek-3.csv', isi: sesuai, judul: 'Cek minggu ke-3' });
    expect(b3.judul).toBe('Cek minggu ke-3');
    expect(await ImporBatch.exists({ _id: b2._id })).toBeNull();
    await expect(svc.hapusVerifikasi(skpd, String(b3._id))).rejects.toMatchObject({ http: 403 });
    await svc.hapusVerifikasi(admin, String(b3._id));
    expect(await ImporBatch.exists({ _id: b3._id })).toBeNull();
    expect(await HasilBanding.countDocuments({ batchId: b3._id })).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'VS', status: 'terbuka' })).toBe(0);
  });

  it('impor APBD tidak membuat master; rujukan hilang ditahan, nama SKPD beda diperingatkan, lalu dilengkapi sesuai kewenangan', async () => {
    const pergeseran = (await Tahapan.findOne({ jenis: 'PERGESERAN', status: 'terbuka' }).lean())!;
    const tid = String(pergeseran._id);
    const jumlahSkpd = await Skpd.countDocuments();
    const isi = ubahCsv((r) => [
      ...r.map((x) => (x.includes('Alkes RSUD') ? x.replace(',Dinas Kesehatan,1.02.0.00.0.00.01.0001', ',DINAS KESEHATAN KAB. BOYOLALI,1.02.0.00.0.00.01.0001') : x)),
      // sub unit belum ada di master
      '2027,1,X,01.02,X,1.02.0.00.0.00.01.0000,Dinas Kesehatan,1.02.0.00.0.00.01.0003,UPT Puskesmas Cepogo,01.02.02,X,1.02.02.2.01,X,1.02.02.2.01.0026,Operasional Pelayanan Fasilitas Kesehatan Lainnya,1.1.01,PAD,5.1,X,P,X,p,1,1,"2.000"',
      // subkegiatan belum ada di nomenklatur (induk kegiatan sudah ada)
      '2027,1,URUSAN WAJIB,01.01,PENDIDIKAN,1.01.2.22.0.00.01.0000,Dinas Pendidikan dan Kebudayaan,1.01.2.22.0.00.01.0001,Dinas Pendidikan dan Kebudayaan,01.01.02,PROGRAM PENGELOLAAN PENDIDIKAN,1.01.02.2.01,Pengelolaan Pendidikan SD,1.01.02.2.01.0098,Rehabilitasi Ruang Kelas,1.2.01.01.01,DAU,5.2,X,P,X,p,1,1,"3.000"',
      // subkegiatan penunjang: di master tertulis X.XX.01.2.02.0001, di APBD memakai urusan SKPD -> tidak ditahan
      '2027,1,X,01.01,X,1.01.2.22.0.00.01.0000,Dinas Pendidikan dan Kebudayaan,1.01.2.22.0.00.01.0001,Dinas Pendidikan dan Kebudayaan,01.01.01,X,1.01.01.2.02,X,1.01.01.2.02.0001,Penyediaan Gaji dan Tunjangan ASN,1.2.01.01.01,DAU,5.1.01,X,P,X,p,1,1,"5.000"',
      // sumber dana belum ada di master
      '2027,1,X,01.01,X,1.01.2.22.0.00.01.0000,Dinas Pendidikan dan Kebudayaan,1.01.2.22.0.00.01.0001,Dinas Pendidikan dan Kebudayaan,01.01.02,X,1.01.02.2.01,X,1.01.02.2.01.0001,Pembangunan Unit Sekolah Baru (USB),1.2.03.01,Dana Insentif Fiskal,5.3,X,P,X,p,1,1,"4.000"',
    ]);
    let b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId: tid, namaFile: 'rujukan.csv', isi });
    expect(b.status).toBe('pratinjau');
    expect(await Skpd.countDocuments()).toBe(jumlahSkpd); // tidak ada SKPD dibuat otomatis
    const rh = b.ringkasan.rujukanHilang as Record<string, { kode: string }[]>;
    expect(rh.subUnit.map((x) => x.kode)).toEqual(['1.02.0.00.0.00.01.0003']);
    expect(rh.subkegiatan.map((x) => x.kode)).toEqual(['1.01.02.2.01.0098']);
    expect(rh.sumberDana.map((x) => x.kode)).toEqual(['1.2.03.01']);
    expect(b.ringkasan.barisDitahan).toBe(3);
    expect((b.ringkasan.perbedaanNama as { skpd: unknown[] }).skpd).toHaveLength(1);
    expect(await Notifikasi.countDocuments({ aturan: 'PD', batchId: b._id, status: 'terbuka' })).toBe(1);

    // kewenangan melengkapi master
    await expect(svc.lengkapiMasterDariImpor(admin, String(b._id), 'subkegiatan')).rejects.toMatchObject({ http: 403 });
    await expect(svc.lengkapiMasterDariImpor(admin, String(b._id), 'perangkat_daerah')).rejects.toMatchObject({ http: 403 });
    expect((await svc.lengkapiMasterDariImpor(admin, String(b._id), 'sumber_dana')).kode).toEqual(['1.2.03.01']);
    await svc.tungguJobLokal();
    expect((await svc.lengkapiMasterDariImpor(sa, String(b._id), 'subkegiatan')).kode).toEqual(['1.01.02.2.01.0098']);
    await svc.tungguJobLokal();
    expect((await svc.lengkapiMasterDariImpor(sa, String(b._id), 'perangkat_daerah')).kode).toEqual(['1.02.0.00.0.00.01.0003']);
    await svc.tungguJobLokal();
    b = (await ImporBatch.findById(b._id).lean())!;
    expect(b.status).toBe('pratinjau');
    expect(b.ringkasan.barisDitahan).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'R9', batchId: b._id, status: 'terbuka' })).toBe(0);
    await terapkan(admin, b._id);
    expect(await SubkegiatanTahapan.exists({ tahapanId: tid, kodeSubkegiatan: '1.01.02.2.01.0098' })).toBeTruthy();
    const gaji = (await SubkegiatanTahapan.findOne({ tahapanId: tid, kodeSubkegiatan: '1.01.01.2.02.0001' }).lean())!;
    expect(gaji).toBeTruthy();
    // detail subkegiatan menemukan nama di master lewat pola X.XX
    expect((await svc.detailSubkegiatan(admin, String(gaji._id))).nomenklatur).toMatchObject({ kode: 'X.XX.01.2.02.0001' });
  });

  it('pindah data: seluruh isi database tersalin ke MongoDB tujuan beserta indeks', async () => {
    // asinkron: execFileSync akan memblokir proses uji yang juga menjalankan mongod (log mongod tak terbaca -> macet)
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const jalankan = promisify(execFile);
    const cli = join(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const skrip = join(__dirname, '..', '..', 'scripts', 'pindah-data.ts');
    const dari = rs.getUri('danboy_uji');
    const ke = rs.getUri('danboy_salinan');
    const jalan = async (...a: string[]) => (await jalankan(process.execPath, [cli, skrip, '--dari', dari, '--ke', ke, ...a], { timeout: 50_000 })).stdout;
    const keluaran = await jalan();
    expect(keluaran).toMatch(/Selesai: .* dokumen dari \d+ koleksi disalin/);
    const db = (await import('@danboy/db')).mongoose.connection.getClient();
    const asal = db.db('danboy_uji');
    const salin = db.db('danboy_salinan');
    for (const n of ['subkegiatanTahapan', 'user', 'logAudit', 'hasilBanding', 'unggahan.files', 'unggahan.chunks']) {
      expect(await salin.collection(n).countDocuments()).toBe(await asal.collection(n).countDocuments());
    }
    const idx = await salin.collection('subkegiatanTahapan').indexes();
    expect(idx.some((i: { unique?: boolean; key: Record<string, unknown> }) => i.unique && 'tahapanId' in i.key && 'kodeSubkegiatan' in i.key)).toBe(true);
    // tujuan sudah berisi: tanpa --timpa ditolak, dengan --timpa berhasil
    await expect(jalan()).rejects.toMatchObject({ stderr: expect.stringMatching(/sudah berisi data/) });
    expect(await jalan('--timpa')).toMatch(/Selesai/);
  });

  it('sandi awal bisa ditetapkan lewat SANDI_AWAL; tetap wajib diganti saat masuk pertama', async () => {
    const lama = process.env.SANDI_AWAL;
    try {
      process.env.SANDI_AWAL = 'Sandi-Awal-Uji-123';
      const r = await svc.buatPengguna(sa, { username: 'keuangan1', nama: 'Admin Keuangan 1', peran: 'admin' });
      expect(r).toMatchObject({ sandiSementara: 'Sandi-Awal-Uji-123', sandiTetap: true });
      const masuk = await svc.verifikasiLogin('keuangan1', 'Sandi-Awal-Uji-123');
      expect(masuk.ok).toBe(true);
      expect(masuk.user?.wajibGantiSandi).toBe(true);
      // sandi baru harus berbeda dari sandi awal
      const u = { ...masuk.user!, peran: 'admin' as const };
      await expect(svc.gantiSandi(u, 'Sandi-Awal-Uji-123', 'Sandi-Awal-Uji-123')).rejects.toMatchObject({ http: 400 });
      await svc.gantiSandi(u, 'Sandi-Awal-Uji-123', 'Keuangan-Baru-2027');
      expect((await svc.resetSandi(sa, masuk.user!.id)).sandiSementara).toBe('Sandi-Awal-Uji-123');
      delete process.env.SANDI_AWAL;
      const acak = await svc.resetSandi(sa, masuk.user!.id);
      expect(acak.sandiTetap).toBe(false);
      expect(acak.sandiSementara).not.toBe('Sandi-Awal-Uji-123');
    } finally {
      if (lama === undefined) delete process.env.SANDI_AWAL;
      else process.env.SANDI_AWAL = lama;
    }
  });

  it('ekspor Excel menghasilkan file xlsx', async () => {
    const e = await svc.ekspor(admin, 'matriks', tahapanId);
    expect(e.isi.readUInt32LE(0)).toBe(0x04034b50);
    const r = await svc.ekspor(admin, 'rekap', tahapanId);
    expect(r.namaFile).toMatch(/rekap/);
  });

  it('tambah, ubah pagu, hapus subkegiatan manual: kode dari master, X.XX diganti bidang urusan, info tagging, hanya Admin', async () => {
    const { Nomenklatur, SubUnit } = await import('@danboy/db');
    const t = (await Tahapan.findOne({ status: 'terbuka' }).sort({ _id: -1 }).lean())!;
    const tid = String(t._id);
    const bidang = (await svc.daftarBidangUrusan(admin))[0];
    const kode = `${bidang.kode}.01.2.02.0001`;
    // sub unit yang belum memiliki subkegiatan ini (tidak menghapus data langsung agar notifikasi tetap konsisten)
    const adaDi = (await svc.calonSubkegiatan(admin, tid, { kode })).sudahAda;
    const subUnit = (await SubUnit.find().sort({ kode: 1 }).lean()).find((u) => !adaDi.includes(String(u._id)))!;
    expect(bidang.kode).not.toMatch(/^X/);
    expect(await Nomenklatur.exists({ kode: bidang.kode, jenis: 'bidang' })).toBeTruthy();

    // pencarian hanya mengembalikan subkegiatan di master; kode X.XX ditandai templat
    const cari = await svc.calonSubkegiatan(admin, tid, { q: 'gaji' });
    expect(cari).toMatchObject({ data: [{ kode: 'X.XX.01.2.02.0001', templat: true }] });

    // akun SKPD ditolak
    const skpd: SessionUser = { id: admin.id, username: 'skpd', nama: 'SKPD', peran: 'skpd', skpdId: String(subUnit.skpdId) };
    const masukan = { subUnitId: String(subUnit._id), kodeNomenklatur: 'X.XX.01.2.02.0001', kodeBidang: bidang.kode, pagu: 5_000_000 };
    await expect(svc.tambahSubkegiatan(skpd, tid, masukan)).rejects.toMatchObject({ http: 403 });
    await expect(svc.calonSubkegiatan(skpd, tid, { q: 'gaji' })).rejects.toMatchObject({ http: 403 });

    // X.XX tanpa bidang urusan, bidang tak dikenal, kode di luar master: ditolak
    await expect(svc.tambahSubkegiatan(admin, tid, { ...masukan, kodeBidang: null })).rejects.toMatchObject({ http: 400 });
    await expect(svc.tambahSubkegiatan(admin, tid, { ...masukan, kodeBidang: '9.99' })).rejects.toMatchObject({ http: 400 });
    await expect(svc.tambahSubkegiatan(admin, tid, { ...masukan, kodeNomenklatur: '9.99.99.2.01.0001' })).rejects.toMatchObject({ http: 400 });

    const r = await svc.tambahSubkegiatan(admin, tid, masukan);
    expect(r.dokumen).toMatchObject({ kodeSubkegiatan: kode, namaSubkegiatan: 'Penyediaan Gaji dan Tunjangan ASN', pagu: 5_000_000, seimbang: false, status: 'aktif' });
    expect(String(r.dokumen.skpdId)).toBe(String(subUnit.skpdId));
    // ganda pada sub unit yang sama ditolak
    await expect(svc.tambahSubkegiatan(admin, tid, masukan)).rejects.toMatchObject({ http: 400 });
    expect((await svc.calonSubkegiatan(admin, tid, { kode })).sudahAda).toContain(String(subUnit._id));

    // subkegiatan yang ditagging: info tagging ikut dikembalikan; sumber dana awal mengisi seluruh pagu
    const sg = (await SumberDana.findOne({ namaTagging: 'DAU SG Pendidikan' }).lean())!;
    const info = await svc.calonSubkegiatan(admin, tid, { kode: '1.01.02.2.02.0025' });
    expect(info.tagging.map((x) => x.sumberDanaId)).toContain(String(sg._id));
    const bebas = (await SubUnit.find().sort({ kode: 1 }).lean()).find((u) => !info.sudahAda.includes(String(u._id)))!;
    const r2 = await svc.tambahSubkegiatan(admin, tid, { subUnitId: String(bebas._id), kodeNomenklatur: '1.01.02.2.02.0025', pagu: 7_000_000, sumberDanaId: String(sg._id) });
    expect(r2.tagging.length).toBeGreaterThan(0);
    expect(r2.dokumen).toMatchObject({ seimbang: true, alokasi: [{ nilai: 7_000_000, asal: 'admin' }] });
    // ubah pagu: alokasi tetap, jadi belum seimbang; konkurensi optimistis; akun SKPD ditolak
    await expect(svc.ubahPaguSubkegiatan(skpd, String(r2.dokumen._id), { updatedAt: String(r2.dokumen.updatedAt), pagu: 1 })).rejects.toMatchObject({ http: 403 });
    const u = await svc.ubahPaguSubkegiatan(admin, String(r2.dokumen._id), { updatedAt: String(r2.dokumen.updatedAt), pagu: 9_000_000 });
    expect(u.dokumen).toMatchObject({ pagu: 9_000_000, seimbang: false, alokasi: [{ nilai: 7_000_000 }] });
    await expect(svc.ubahPaguSubkegiatan(admin, String(r2.dokumen._id), { updatedAt: String(r2.dokumen.updatedAt), pagu: 1 })).rejects.toMatchObject({ kode: 'DATA_BERUBAH' });
    expect(await Notifikasi.countDocuments({ aturan: 'R4', status: 'terbuka', subkegiatanTahapanId: r2.dokumen._id })).toBe(1);
    await cekSamaDenganPenuh(tid);
    // pagu sumber dana diisi kecil -> R3 muncul; dikembalikan -> R3 hilang; keduanya sama dengan hitung penuh
    const paguLama = (await svc.daftarPaguSumberDana(admin, tid)).find((x) => x.sumberDanaId === String(sg._id))?.nilai ?? null;
    await svc.simpanPaguSumberDana(admin, tid, [{ sumberDanaId: String(sg._id), nilai: 1 }]);
    expect(await Notifikasi.countDocuments({ aturan: 'R3', status: 'terbuka', sumberDanaId: sg._id })).toBe(1);
    await cekSamaDenganPenuh(tid);
    await svc.simpanPaguSumberDana(admin, tid, [{ sumberDanaId: String(sg._id), nilai: paguLama }]);
    await cekSamaDenganPenuh(tid);

    // hapus: hanya Admin; tercatat di log audit; notifikasinya tertutup
    await expect(svc.hapusSubkegiatan(skpd, String(r.dokumen._id))).rejects.toMatchObject({ http: 403 });
    await svc.hapusSubkegiatan(admin, String(r.dokumen._id));
    await svc.hapusSubkegiatan(admin, String(r2.dokumen._id));
    expect(await SubkegiatanTahapan.countDocuments({ _id: { $in: [r.dokumen._id, r2.dokumen._id] } })).toBe(0);
    expect(await LogAudit.countDocuments({ aksi: 'hapus', koleksi: 'subkegiatanTahapan', dokumenId: { $in: [r.dokumen._id, r2.dokumen._id] } })).toBe(2);
    expect(await Notifikasi.countDocuments({ status: 'terbuka', subkegiatanTahapanId: { $in: [r.dokumen._id, r2.dokumen._id] } })).toBe(0);
    await expect(svc.hapusSubkegiatan(admin, String(r.dokumen._id))).rejects.toMatchObject({ http: 404 });
    await cekSamaDenganPenuh(tid);
  });

  it('impor APBD "hanya pagu": sumber dana di file diabaikan, alokasi tersimpan tetap, kode sumber dana asing tidak ditahan', async () => {
    const t = (await Tahapan.findOne({ jenis: 'PERGESERAN', status: 'terbuka' }).lean())!;
    const tid = String(t._id);
    const kunci = { tahapanId: t._id, kodeSubkegiatan: '1.01.02.2.01.0001' };
    const sebelum = (await SubkegiatanTahapan.findOne(kunci).lean())!;
    // baris DAK Fisik USB: sumber dana diganti kode yang tidak ada di master, pagu naik 100 juta
    const isi = ubahCsv((r) =>
      r.map((x) => (x.includes('USB SDN 3 Mojosongo') ? x.replace(',1.2.02.01.01,DAK Fisik,', ',9.9.99.99,Sumber Asing,').replace('"1.500.000.000","1.500.000.000"', '"1.600.000.000","1.600.000.000"') : x)),
    );
    const b = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId: tid, namaFile: 'hanya-pagu.csv', isi, abaikanSumberDana: true });
    expect(b.status).toBe('pratinjau');
    expect(b.opsi?.abaikanSumberDana).toBe(true);
    expect(b.ringkasan.abaikanSumberDana).toBe(true);
    expect((b.ringkasan.rujukanHilang as { sumberDana: unknown[] }).sumberDana).toEqual([]);
    expect(b.ringkasan.barisDitahan).toBe(0);
    expect((b.ringkasan.temuan as Record<string, number>).R2 ?? 0).toBe(0);
    await terapkan(admin, b._id);
    const sesudah = (await SubkegiatanTahapan.findOne(kunci).lean())!;
    expect(sesudah.pagu).toBe(1_625_000_000);
    expect(JSON.stringify(sesudah.alokasi)).toBe(JSON.stringify(sebelum.alokasi));
    expect(JSON.stringify(sesudah.alokasiSipd)).toBe(JSON.stringify(sebelum.alokasiSipd));
    expect(sesudah.beda.ada).toBe(sebelum.beda.ada);
    expect(sesudah.seimbang).toBe(sesudah.alokasi.reduce((a, x) => a + x.nilai, 0) === sesudah.pagu);
    await cekSamaDenganPenuh(tid);

    // file sama dengan pilihan "pagu dan sumber dana" tetap diproses (tidak dianggap sama persis)
    const b2 = await unggahDanTunggu(admin, { jenis: 'apbd', tahapanId: tid, namaFile: 'hanya-pagu.csv', isi });
    expect(b2.ringkasan.tidakAdaPerubahan).not.toBe(true);
    expect((b2.ringkasan.rujukanHilang as { sumberDana: { kode: string }[] }).sumberDana.map((x) => x.kode)).toEqual(['9.9.99.99']);
    await svc.batalImpor(admin, String(b2._id));
  });

  it('Ikut SIPD untuk semua: semua yang beda mengikuti SIPD sekaligus; notifikasi R2 tertutup', async () => {
    const t = (await Tahapan.findOne({ jenis: 'PERGESERAN', status: 'terbuka' }).lean())!;
    const tid = String(t._id);
    const calon = await SubkegiatanTahapan.find({ tahapanId: t._id, status: 'aktif', 'alokasiSipd.0': { $exists: true } }).limit(2).lean();
    expect(calon).toHaveLength(2);
    const ids = calon.map((d) => d._id);
    // buat keadaan "beda dengan SIPD": alokasi dikosongkan, ditandai beda
    await SubkegiatanTahapan.updateMany({ _id: { $in: ids } }, { $set: { alokasi: [], seimbang: false, beda: { ada: true, hashSipd: 'uji' } } });
    await svc.segarkanNotifikasi(tid);
    expect(await Notifikasi.countDocuments({ aturan: 'R2', status: 'terbuka', subkegiatanTahapanId: { $in: ids } })).toBe(2);
    const r = await svc.ikutSipdSemua(admin, tid, {});
    expect(r.jumlah).toBeGreaterThanOrEqual(2);
    for (const d of await SubkegiatanTahapan.find({ _id: { $in: ids } }).lean()) {
      const asal = calon.find((c) => String(c._id) === String(d._id))!;
      expect(d.beda).toMatchObject({ ada: false, diputuskan: 'ikut_sipd' });
      expect(d.alokasi.map((a) => String(a.sumberDanaId)).sort()).toEqual(asal.alokasiSipd.map((a) => String(a.sumberDanaId)).sort());
      expect(d.alokasi.every((a) => a.asal === 'sipd')).toBe(true);
    }
    expect(await SubkegiatanTahapan.countDocuments({ tahapanId: t._id, 'beda.ada': true })).toBe(0);
    expect(await Notifikasi.countDocuments({ aturan: 'R2', status: 'terbuka', tahapanId: t._id })).toBe(0);
    await cekSamaDenganPenuh(tid);
  });

  it('unduhan matriks berisi persis gabungan semua halaman matriks', async () => {
    const t = (await Tahapan.findOne({ jenis: 'PERGESERAN', status: 'terbuka' }).lean())!;
    const tid = String(t._id);
    for (const f of [{}, { jumlahSd: 'dua_lebih' as const }, { bedaTagging: '1' }]) {
      const semua = await svc.matriksSemua(admin, tid, f);
      const halaman1 = await svc.matriks(admin, tid, { ...f, page: 1, limit: 2 });
      const gabung = [...halaman1.data];
      for (let p = 2; (p - 1) * 2 < halaman1.total; p++) gabung.push(...(await svc.matriks(admin, tid, { ...f, page: p, limit: 2 })).data);
      expect(semua.total).toBe(halaman1.total);
      expect(JSON.stringify(semua.data)).toBe(JSON.stringify(gabung));
      expect(JSON.stringify(semua.kolom)).toBe(JSON.stringify(halaman1.kolom));
    }
    const e = await svc.ekspor(admin, 'matriks', tid, { jumlahSd: 'dua_lebih' });
    expect(e.isi.readUInt32LE(0)).toBe(0x04034b50);
  });

  it('log audit ubah mencatat isi sebelum dan sesudah', async () => {
    const t = (await Tahapan.findOne({ jenis: 'PERGESERAN', status: 'terbuka' }).lean())!;
    const d = (await SubkegiatanTahapan.findOne({ tahapanId: t._id, status: 'aktif' }).lean())!;
    // ubah pagu memakai findOneAndUpdate lean + new: hasil query langsung dipakai plugin audit
    await svc.ubahPaguSubkegiatan(admin, String(d._id), { updatedAt: new Date(d.updatedAt).toISOString(), pagu: d.pagu + 1000 });
    const log = (await LogAudit.findOne({ koleksi: 'subkegiatanTahapan', dokumenId: d._id, aksi: 'ubah' }).sort({ waktu: -1 }).lean())!;
    expect(log.sebelum).toMatchObject({ pagu: d.pagu });
    expect(log.sesudah).toMatchObject({ pagu: d.pagu + 1000 });
    expect(Object.keys(log.sesudah ?? {})).not.toContain('updatedAt');
    // Ikut SIPD satu memakai findOneAndUpdate tanpa lean: tetap tercatat lengkap
    await SubkegiatanTahapan.updateOne({ _id: d._id }, { $set: { beda: { ada: true, hashSipd: 'uji' } } });
    await svc.ikutSipd(admin, String(d._id));
    const log2 = (await LogAudit.findOne({ koleksi: 'subkegiatanTahapan', dokumenId: d._id, aksi: 'ubah' }).sort({ waktu: -1 }).lean())!;
    expect((log2.sesudah as { beda?: { diputuskan?: string } }).beda?.diputuskan).toBe('ikut_sipd');
    expect((log2.sebelum as { beda?: { ada?: boolean } }).beda?.ada).toBe(true);
    await svc.segarkanNotifikasi(String(t._id));
  });

  it('tagging dari master: pencarian subkegiatan, X.XX untuk semua bidang atau satu bidang', async () => {
    const cari = await svc.cariSubkegiatanMaster(admin, 'gaji');
    expect(cari.data).toEqual([{ kode: 'X.XX.01.2.02.0001', nama: expect.any(String), templat: true }]);
    expect((await svc.cariSubkegiatanMaster(admin, 'g')).data).toEqual([]);
    const sd = (await SumberDana.findOne({ khusus: true }).lean())!;
    const bidang = (await svc.daftarBidangUrusan(admin))[0];
    const semua = await svc.buatTagging(admin, { tahun: 2031, sumberDanaId: String(sd._id), kodeSubkegiatan: 'X.XX.01.2.02.0001', kategori: '', rincian: 'semua' });
    const satu = await svc.buatTagging(admin, { tahun: 2031, sumberDanaId: String(sd._id), kodeSubkegiatan: bidang.kode + '.01.2.02.0001', kategori: '', rincian: 'satu' });
    expect(semua.kodeSubkegiatan).toBe('X.XX.01.2.02.0001');
    expect(satu.kodeSubkegiatan).toBe(bidang.kode + '.01.2.02.0001');
    await svc.hapusTagging(admin, String(semua._id));
    await svc.hapusTagging(admin, String(satu._id));
  });
});
