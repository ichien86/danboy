import { createHash } from 'node:crypto';
import type { AnyBulkWriteOperation } from 'mongoose';
import {
  HasilBanding,
  ImporBatch,
  ImporBaris,
  Nomenklatur,
  Skpd,
  SubUnit,
  SubkegiatanTahapan,
  SumberDana,
  bacaFile,
  catatAudit,
  dalamTransaksi,
  oid,
  sambung,
  simpanFile,
  type ImporBatchDoc,
  type JenisImpor,
  type SubkegiatanTahapanDoc,
} from '@danboy/db';
import { GalatFormat, bacaTabel, deteksiJenis } from '@danboy/excel';
import { barisApbd } from '@danboy/schema';
import { aksiImpor, pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { adaDiNomenklatur, normalisasiKode } from '../kode';
import { banding, kunciSubkegiatan, type Operasi, type Temuan, type Tersimpan } from '../pembanding';
import { rekapSipd, type BarisTerpetakan } from '../rekap';
import { parseRupiah } from '../rupiah';
import { tambahJob } from './antrean';
import { segarkanNotifikasi, terapkanCalon } from './notifikasi';
import { batasUnggahMb, muatTahapan, pastikanId, pastikanTahapanTerbuka } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const KOLOM_WAJIB_APBD = [
  'TAHUN',
  'KODE SKPD',
  'NAMA SKPD',
  'KODE SUB UNIT',
  'NAMA SUB UNIT',
  'KODE SUB KEGIATAN',
  'NAMA SUB KEGIATAN',
  'KODE SUMBER DANA',
  'NAMA SUMBER DANA',
  'KODE REKENING',
  'PAGU',
];

export interface InputUnggah {
  jenis: JenisImpor;
  tahapanId?: string;
  tahun?: number;
  versi?: string;
  namaFile: string;
  isi: Buffer;
}

/** POST /api/impor: simpan ke GridFS, buat batch, masukkan job proses. */
export async function unggahImpor(user: SessionUser, input: InputUnggah) {
  pastikanBoleh(user, 'impor');
  pastikanBoleh(user, aksiImpor(input.jenis));
  await sambung();
  if (input.isi.length > batasUnggahMb() * 1024 * 1024)
    throw new Galat('FILE_TERLALU_BESAR', `Ukuran file melebihi ${batasUnggahMb()} MB`);
  const jenisFile = deteksiJenis(input.namaFile, input.isi);
  if (!jenisFile) throw new Galat('FORMAT_FILE', 'Hanya file .xlsx atau .csv yang valid yang diterima');

  let tahapanId: ReturnType<typeof oid> | null = null;
  let tahun: number | null = input.tahun ?? null;
  if (input.jenis === 'apbd') {
    const t = await pastikanTahapanTerbuka(pastikanId(input.tahapanId, 'Tahapan'));
    tahapanId = t._id;
    tahun = t.tahun;
    const berjalan = await ImporBatch.findOne({ tahapanId, jenis: 'apbd', status: 'diproses' }).lean();
    if (berjalan) throw new Galat('IMPOR_BERJALAN', 'Masih ada impor yang sedang diproses untuk tahapan ini');
    // unggahan baru membatalkan pratinjau lama
    const lama = await ImporBatch.find({ tahapanId, jenis: 'apbd', status: 'pratinjau' }).select('_id').lean();
    if (lama.length) {
      await ImporBatch.updateMany({ _id: { $in: lama.map((l) => l._id) } }, { $set: { status: 'dibatalkan' } });
      for (const l of lama) await terapkanCalon([], { aturan: ['R9'], batchId: l._id });
    }
  } else if (input.jenis === 'verifikasi') {
    // verifikasi tidak mengubah data, jadi boleh terhadap tahapan dengan status apa pun
    const t = await muatTahapan(pastikanId(input.tahapanId, 'Tahapan'));
    tahapanId = t._id;
    tahun = t.tahun;
    const berjalan = await ImporBatch.findOne({ tahapanId, jenis: 'verifikasi', status: { $in: ['diunggah', 'diproses'] } }).lean();
    if (berjalan) throw new Galat('IMPOR_BERJALAN', 'Masih ada verifikasi yang sedang diproses untuk tahapan ini');
  } else {
    const berjalan = await ImporBatch.findOne({ jenis: input.jenis, status: 'diproses' }).lean();
    if (berjalan) throw new Galat('IMPOR_BERJALAN', 'Masih ada impor jenis ini yang sedang diproses');
    await ImporBatch.updateMany({ jenis: input.jenis, status: 'pratinjau' }, { $set: { status: 'dibatalkan' } });
    if (input.jenis === 'tagging' && !tahun) throw new Galat('VALIDASI', 'Tahun tagging wajib diisi');
  }
  const hashFile = createHash('sha256').update(input.isi).digest('hex');
  const fileId = await simpanFile(input.namaFile, input.isi, { jenis: input.jenis, olehId: user.id });
  const batch = await ImporBatch.create({
    tahapanId,
    tahun,
    jenis: input.jenis,
    namaFile: input.namaFile,
    hashFile,
    fileId,
    ukuran: input.isi.length,
    status: 'diunggah',
    olehId: oid(user.id),
    ringkasan: input.versi ? { versi: input.versi } : {},
  });
  const job = input.jenis === 'apbd' ? 'imporApbd:proses' : input.jenis === 'verifikasi' ? 'verifikasi:proses' : 'imporMaster:proses';
  await tambahJob(job, { batchId: String(batch._id), userId: user.id });
  return ser(batch.toObject());
}

export async function daftarImpor(user: SessionUser, f: { jenis?: string; tahapanId?: string; page?: number; limit?: number }) {
  pastikanBoleh(user, 'impor');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (f.jenis) filter.jenis = f.jenis;
  if (f.tahapanId) filter.tahapanId = oid(pastikanId(f.tahapanId));
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 20, 200);
  const [data, total] = await Promise.all([
    ImporBatch.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('olehId', 'nama username').populate('tahapanId', 'nama').lean(),
    ImporBatch.countDocuments(filter),
  ]);
  return { data: ser(data), total, page, limit };
}

/** GET /api/impor/{batchId}: status, progres, ringkasan, dan pratinjau berhalaman. */
export async function statusImpor(
  user: SessionUser,
  batchId: string,
  f: { bagian?: 'hasil' | 'ditahan' | 'baris' | 'diproses' | 'sama'; aturan?: string; page?: number; limit?: number } = {},
) {
  pastikanBoleh(user, 'impor');
  await sambung();
  const batch = await ImporBatch.findById(pastikanId(batchId, 'Batch')).populate('olehId', 'nama username').populate('tahapanId', 'nama status').lean();
  if (!batch) throw tidakDitemukan('Batch impor');
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  let daftar: { data: unknown[]; total: number } = { data: [], total: 0 };
  if (f.bagian === 'hasil' && batch.jenis === 'apbd') {
    const filter: Record<string, unknown> = { batchId: batch._id };
    if (f.aturan) filter.aturan = { $regex: `(^|,)${f.aturan}(,|$)` };
    const [data, total] = await Promise.all([
      HasilBanding.find(filter).select('-operasi').sort({ kodeSubkegiatan: 1 }).skip((page - 1) * limit).limit(limit).populate('skpdId', 'kode nama').lean(),
      HasilBanding.countDocuments(filter),
    ]);
    daftar = { data, total };
  } else if (f.bagian === 'ditahan' || f.bagian === 'baris' || f.bagian === 'diproses' || f.bagian === 'sama') {
    const filter: Record<string, unknown> = { batchId: batch._id };
    if (f.bagian === 'ditahan') filter.status = 'ditahan';
    // impor master: baris baru/berubah (diproses) dipisah dari baris yang sama dengan master (dilewati)
    if (f.bagian === 'diproses') Object.assign(filter, { status: 'ok', 'data.aksi': { $ne: 'sama' } });
    if (f.bagian === 'sama') Object.assign(filter, { status: 'ok', 'data.aksi': 'sama' });
    if (f.aturan) filter['data.aksi'] = f.aturan;
    const [data, total] = await Promise.all([
      ImporBaris.find(filter).sort({ noBaris: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      ImporBaris.countDocuments(filter),
    ]);
    daftar = { data, total };
  }
  return ser({ batch, ...daftar, page, limit });
}

/** Izin per jenis batch: impor nomenklatur hanya Super Admin, jenis lain Super Admin dan Admin Keuangan. */
async function pastikanBolehBatch(user: SessionUser, batchId: string): Promise<ImporBatchDoc> {
  pastikanBoleh(user, 'impor');
  await sambung();
  const b = await ImporBatch.findById(pastikanId(batchId, 'Batch')).lean<ImporBatchDoc>();
  if (!b) throw tidakDitemukan('Batch impor');
  pastikanBoleh(user, aksiImpor(b.jenis));
  return b;
}

/**
 * Terapkan pratinjau. Bila ada baris yang ditahan (rujukan belum ada di master, data tidak valid), pengguna harus
 * mengonfirmasi bahwa baris tersebut tidak ikut diimpor; tanpa konfirmasi permintaan ditolak PERLU_KONFIRMASI.
 */
export async function terapkanImpor(user: SessionUser, batchId: string, opsi: { konfirmasi?: boolean } = {}) {
  const b = await pastikanBolehBatch(user, batchId);
  const rk = (b.ringkasan ?? {}) as Record<string, unknown>;
  const ditahan = Number(rk.barisDitahan ?? rk.ditahan ?? rk.barisGagal ?? 0);
  if (ditahan > 0 && !opsi.konfirmasi && b.status === 'pratinjau')
    throw new Galat('PERLU_KONFIRMASI', `${ditahan} baris ditahan dan tidak akan ikut diimpor`, { barisDitahan: ditahan, totalPaguDitahan: rk.totalPaguDitahan ?? null });
  if (b.status !== 'pratinjau') throw new Galat('DATA_BERUBAH', `Batch berstatus ${b.status}, bukan pratinjau`);
  if (b.jenis === 'apbd') await pastikanTahapanTerbuka(b.tahapanId);
  await ImporBatch.updateOne({ _id: b._id }, { $set: { 'ringkasan.sedangDiterapkan': true } });
  await tambahJob(b.jenis === 'apbd' ? 'imporApbd:terapkan' : 'imporMaster:terapkan', { batchId, userId: user.id });
  return { ok: true };
}

export async function batalImpor(user: SessionUser, batchId: string) {
  await pastikanBolehBatch(user, batchId);
  const b = await ImporBatch.findOneAndUpdate(
    { _id: oid(pastikanId(batchId, 'Batch')), status: { $in: ['pratinjau', 'diunggah', 'gagal'] } },
    { $set: { status: 'dibatalkan' } },
    { new: true },
  ).lean();
  if (!b) throw new Galat('DATA_BERUBAH', 'Batch tidak bisa dibatalkan pada status ini');
  await terapkanCalon([], { aturan: ['R9'], batchId: b._id });
  return ser(b);
}

/** Proses ulang batch (misal setelah kode yang ditahan ditambahkan ke master): menutup R9 yang sudah teratasi. */
export async function prosesUlangImpor(user: SessionUser, batchId: string) {
  await pastikanBolehBatch(user, batchId);
  const b = await ImporBatch.findOneAndUpdate(
    {
      _id: oid(pastikanId(batchId, 'Batch')),
      // verifikasi yang sudah selesai boleh dicek ulang (misal setelah alokasi di aplikasi diperbaiki)
      $or: [{ status: { $in: ['pratinjau', 'gagal'] } }, { jenis: 'verifikasi', status: 'selesai' }],
    },
    { $set: { status: 'diunggah', progres: 0, galat: null } },
    { new: true },
  ).lean();
  if (!b) throw new Galat('DATA_BERUBAH', 'Hanya batch pratinjau atau gagal yang bisa diproses ulang');
  const job = b.jenis === 'apbd' ? 'imporApbd:proses' : b.jenis === 'verifikasi' ? 'verifikasi:proses' : 'imporMaster:proses';
  await tambahJob(job, { batchId, userId: user.id });
  return ser(b);
}

/* ------------------------------------------------------------------ */
/* Job imporApbd:proses                                                */
/* ------------------------------------------------------------------ */

const teks = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export async function prosesApbd(batchId: string) {
  await sambung();
  const batch = await ImporBatch.findOneAndUpdate(
    { _id: oid(batchId), status: 'diunggah' },
    { $set: { status: 'diproses', progres: 1, galat: null } },
    { new: true },
  ).lean<ImporBatchDoc>();
  if (!batch) return;
  const set = (s: Record<string, unknown>) => ImporBatch.updateOne({ _id: batch._id }, { $set: s });
  try {
    const tahapan = await pastikanTahapanTerbuka(batch.tahapanId);
    const terakhir = await ImporBatch.findOne({ tahapanId: tahapan._id, jenis: 'apbd', status: 'diterapkan' })
      .sort({ diterapkanPada: -1 })
      .lean<ImporBatchDoc>();
    if (terakhir && terakhir.hashFile === batch.hashFile) {
      await HasilBanding.deleteMany({ batchId: batch._id });
      await set({
        status: 'pratinjau',
        progres: 100,
        ringkasan: { tidakAdaPerubahan: true, pesan: 'File sama persis dengan impor terakhir yang diterapkan; tidak ada perubahan.', operasi: { tambah: 0, ubah: 0, tandai_hilang: 0 } },
      });
      return;
    }

    const isi = await bacaFile(batch.fileId);
    const jenisFile = deteksiJenis(batch.namaFile, isi);
    if (!jenisFile) throw new Galat('FORMAT_FILE', 'Format file tidak dikenali');

    // master untuk pencocokan kode. Impor APBD TIDAK membuat data master: rujukan yang belum ada ditahan
    // dan dikelompokkan untuk dikonfirmasi (atau dilengkapi oleh yang berwenang lalu diproses ulang).
    const skpdMaster = new Map((await Skpd.find().lean()).map((s) => [s.kode, { id: String(s._id), nama: s.nama }]));
    const subUnitMaster = new Map(
      (await SubUnit.find().lean()).map((s) => [s.kode, { id: String(s._id), skpdId: String(s.skpdId), nama: s.nama }]),
    );
    const kodeSkpdPerId = new Map([...skpdMaster].map(([kode, v]) => [v.id, kode]));
    const sdPer = new Map((await SumberDana.find().lean()).map((s) => [s.kode, String(s._id)]));
    const kodeNomenklatur = new Set((await Nomenklatur.find({ jenis: 'subkegiatan', aktif: true }).select('kode').lean()).map((n) => n.kode));

    await ImporBaris.deleteMany({ batchId: batch._id });
    await HasilBanding.deleteMany({ batchId: batch._id });

    type Rujukan = { kode: string; nama: string; baris: number; pagu: number; kodeSkpd?: string };
    const hilang = {
      subkegiatan: new Map<string, Rujukan>(),
      sumberDana: new Map<string, Rujukan>(),
      skpd: new Map<string, Rujukan>(),
      subUnit: new Map<string, Rujukan>(),
    };
    const catatHilang = (m: Map<string, Rujukan>, kode: string, nama: string, pagu: number, kodeSkpd?: string) => {
      const r = m.get(kode) ?? { kode, nama, baris: 0, pagu: 0, ...(kodeSkpd ? { kodeSkpd } : {}) };
      r.baris++;
      r.pagu += pagu || 0;
      m.set(kode, r);
    };
    const bedaNama = { skpd: new Map<string, { kode: string; namaMaster: string; namaFile: string }>(), subUnit: new Map<string, { kode: string; namaMaster: string; namaFile: string; catatan?: string }>() };
    const samaNama = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toUpperCase() === b.replace(/\s+/g, ' ').trim().toUpperCase();

    const ringkasan = {
      barisTotal: 0,
      barisOk: 0,
      barisDitahan: 0,
      totalPaguFile: 0,
      totalPaguOk: 0,
      totalPaguDitahan: 0,
      tahunSalah: 0,
      barisTidakValid: 0,
      peringatan: [] as string[],
    };
    if (!kodeNomenklatur.size) ringkasan.peringatan.push('Master nomenklatur masih kosong: semua baris akan ditahan sampai Super Admin mengisi nomenklatur.');
    if (!skpdMaster.size) ringkasan.peringatan.push('Master perangkat daerah masih kosong: impor perangkat daerah lebih dulu (Super Admin).');
    if (!sdPer.size) ringkasan.peringatan.push('Master sumber dana masih kosong: impor sumber dana lebih dulu (Admin Keuangan).');
    const terpetakan: BarisTerpetakan[] = [];
    let blok: Record<string, unknown>[] = [];
    const simpanBlok = async () => {
      if (!blok.length) return;
      await ImporBaris.insertMany(blok, { ordered: false });
      blok = [];
      await set({ progres: Math.min(60, 5 + Math.floor(ringkasan.barisTotal / 250)), 'ringkasan.barisDibaca': ringkasan.barisTotal });
    };

    for await (const { noBaris, data } of bacaTabel(isi, jenisFile, { kolomWajib: KOLOM_WAJIB_APBD })) {
      ringkasan.barisTotal++;
      const paguMentah = parseRupiah(data['PAGU']);
      if (paguMentah !== null) ringkasan.totalPaguFile += paguMentah;
      const kandidat = {
        ...Object.fromEntries(KOLOM_WAJIB_APBD.map((k) => [k, teks(data[k])])),
        TAHUN: data['TAHUN'],
        PAGU: paguMentah,
      };
      const v = barisApbd.safeParse(kandidat);
      const simpan: Record<string, unknown> = {
        tahun: data['TAHUN'],
        kodeSkpd: teks(data['KODE SKPD']),
        namaSkpd: teks(data['NAMA SKPD']),
        kodeSubUnit: teks(data['KODE SUB UNIT']),
        namaSubUnit: teks(data['NAMA SUB UNIT']),
        kodeSubkegiatan: normalisasiKode(data['KODE SUB KEGIATAN']),
        namaSubkegiatan: teks(data['NAMA SUB KEGIATAN']),
        // hierarki nomenklatur dari file (opsional), dipakai saat "Tambahkan ke master"
        kodeUrusan: normalisasiKode(data['KODE URUSAN']),
        namaUrusan: teks(data['NAMA URUSAN']),
        kodeBidang: normalisasiKode(data['KODE BIDANG URUSAN']),
        namaBidang: teks(data['NAMA BIDANG URUSAN']),
        kodeProgram: normalisasiKode(data['KODE PROGRAM']),
        namaProgram: teks(data['NAMA PROGRAM']),
        kodeKegiatan: normalisasiKode(data['KODE KEGIATAN']),
        namaKegiatan: teks(data['NAMA KEGIATAN']),
        kodeSumberDana: teks(data['KODE SUMBER DANA']),
        namaSumberDana: teks(data['NAMA SUMBER DANA']),
        kodeRekening: teks(data['KODE REKENING']),
        namaRekening: teks(data['NAMA REKENING']),
        paket: teks(data['PAKET'] ?? data['KODE PAKET']),
        namaPaket: teks(data['NAMA PAKET']),
        pagu: paguMentah,
      };
      let alasan: string | undefined;
      const rujukan: string[] = [];
      if (!v.success) {
        alasan = v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        ringkasan.barisTidakValid++;
      } else if (v.data.TAHUN !== tahapan.tahun) {
        ringkasan.tahunSalah++;
        alasan = `TAHUN ${v.data.TAHUN} tidak sama dengan tahun tahapan ${tahapan.tahun}`;
      }
      const kodeSkpd = simpan.kodeSkpd as string;
      const kodeSu = simpan.kodeSubUnit as string;
      const kodeSub = simpan.kodeSubkegiatan as string;
      const kodeSd = simpan.kodeSumberDana as string;
      const pagu = (paguMentah as number) ?? 0;
      let su = subUnitMaster.get(kodeSu);
      if (!alasan) {
        const sk = skpdMaster.get(kodeSkpd);
        if (!sk) {
          catatHilang(hilang.skpd, kodeSkpd, simpan.namaSkpd as string, pagu);
          rujukan.push('skpd');
        } else if (!samaNama(sk.nama, simpan.namaSkpd as string)) {
          bedaNama.skpd.set(kodeSkpd, { kode: kodeSkpd, namaMaster: sk.nama, namaFile: simpan.namaSkpd as string });
        }
        if (!su) {
          catatHilang(hilang.subUnit, kodeSu, simpan.namaSubUnit as string, pagu, kodeSkpd);
          rujukan.push('sub_unit');
        } else {
          if (!samaNama(su.nama, simpan.namaSubUnit as string))
            bedaNama.subUnit.set(kodeSu, { kode: kodeSu, namaMaster: su.nama, namaFile: simpan.namaSubUnit as string });
          if (sk && su.skpdId !== sk.id)
            bedaNama.subUnit.set(kodeSu, {
              kode: kodeSu,
              namaMaster: su.nama,
              namaFile: simpan.namaSubUnit as string,
              catatan: `di master berada di SKPD ${kodeSkpdPerId.get(su.skpdId) ?? '?'}, di file di SKPD ${kodeSkpd}; data mengikuti master`,
            });
        }
        if (!adaDiNomenklatur(kodeNomenklatur, kodeSub)) {
          catatHilang(hilang.subkegiatan, kodeSub, simpan.namaSubkegiatan as string, pagu);
          rujukan.push('subkegiatan');
        }
        if (!sdPer.has(kodeSd)) {
          catatHilang(hilang.sumberDana, kodeSd, simpan.namaSumberDana as string, pagu);
          rujukan.push('sumber_dana');
        }
        if (rujukan.length) {
          const nama = { skpd: 'SKPD', sub_unit: 'sub unit', subkegiatan: 'subkegiatan', sumber_dana: 'sumber dana' } as Record<string, string>;
          alasan = `Belum ada di master: ${rujukan.map((r) => nama[r]).join(', ')}`;
          simpan.rujukan = rujukan;
        }
      }
      if (!alasan && su) {
        // sub unit tertaut ke SKPD menurut master
        terpetakan.push({
          skpdId: su.skpdId,
          subUnitId: su.id,
          kodeSubkegiatan: kodeSub,
          namaSubkegiatan: simpan.namaSubkegiatan as string,
          sumberDanaId: sdPer.get(kodeSd)!,
          kodeSumberDana: kodeSd,
          kodeRekening: simpan.kodeRekening as string,
          paket: (simpan.paket as string) || undefined,
          namaPaket: (simpan.namaPaket as string) || undefined,
          pagu,
        });
        ringkasan.barisOk++;
        ringkasan.totalPaguOk += pagu;
      } else {
        ringkasan.barisDitahan++;
        ringkasan.totalPaguDitahan += pagu;
      }
      su = undefined;
      blok.push({ batchId: batch._id, noBaris, data: simpan, status: alasan ? 'ditahan' : 'ok', alasan });
      if (blok.length >= 1000) await simpanBlok();
    }
    await simpanBlok();

    if (ringkasan.barisTotal === 0) throw new Galat('FORMAT_FILE', 'File tidak berisi baris data');
    if (ringkasan.barisOk === 0 && ringkasan.tahunSalah > 0)
      throw new Galat('FORMAT_FILE', `TAHUN di file tidak cocok dengan tahun tahapan ${tahapan.tahun}`);
    const urutKode = (m: Map<string, Rujukan>) => [...m.values()].sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
    const rujukanHilang = {
      subkegiatan: urutKode(hilang.subkegiatan),
      sumberDana: urutKode(hilang.sumberDana),
      skpd: urutKode(hilang.skpd),
      subUnit: urutKode(hilang.subUnit),
    };
    const perbedaanNama = { skpd: [...bedaNama.skpd.values()], subUnit: [...bedaNama.subUnit.values()] };
    await set({ progres: 65 });

    // rekap + banding
    const sipd = rekapSipd(terpetakan);
    const tersimpanDocs = await SubkegiatanTahapan.find({ tahapanId: tahapan._id }).lean<SubkegiatanTahapanDoc[]>();
    const versi = new Map<string, string>();
    const tersimpan = new Map<string, Tersimpan>();
    for (const d of tersimpanDocs) {
      const k = kunciSubkegiatan(String(d.subUnitId), d.kodeSubkegiatan);
      versi.set(k, new Date(d.updatedAt).toISOString());
      tersimpan.set(k, {
        id: String(d._id),
        pagu: d.pagu,
        status: d.status,
        namaSubkegiatan: d.namaSubkegiatan,
        alokasi: d.alokasi.map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai, nilaiSipd: a.nilaiSipd, asal: a.asal })),
        alokasiSipd: (d.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai })),
        beda: ser(d.beda ?? { ada: false }) as unknown as Tersimpan["beda"],
        seimbang: d.seimbang,
        rincian: (d.rincian ?? []).map((r) => ({ ...r })),
      });
    }
    const hasil = banding(tersimpan, sipd);
    await set({ progres: 80 });

    const temuanPer = new Map<string, Temuan[]>();
    for (const t of hasil.temuan) temuanPer.set(t.kunci, [...(temuanPer.get(t.kunci) ?? []), t]);
    const hitungAturan: Record<string, number> = {};
    for (const t of hasil.temuan) hitungAturan[t.aturan] = (hitungAturan[t.aturan] ?? 0) + 1;
    const hitungOp = { tambah: 0, ubah: 0, tandai_hilang: 0 };
    const docs: Record<string, unknown>[] = [];
    const infoKunci = (k: string) => {
      const s = sipd.get(k);
      const d = tersimpanDocs.find((x) => kunciSubkegiatan(String(x.subUnitId), x.kodeSubkegiatan) === k);
      return {
        skpdId: s?.skpdId ?? (d ? String(d.skpdId) : undefined),
        kodeSubkegiatan: s?.kodeSubkegiatan ?? d?.kodeSubkegiatan,
        namaSubkegiatan: s?.namaSubkegiatan ?? d?.namaSubkegiatan,
      };
    };
    const tersimpanPerKunci = new Map(tersimpanDocs.map((d) => [kunciSubkegiatan(String(d.subUnitId), d.kodeSubkegiatan), d]));
    for (const op of hasil.operasi) {
      hitungOp[op.jenis]++;
      const ts = temuanPer.get(op.kunci) ?? [];
      const aturan = [...new Set(ts.map((t) => t.aturan))].join(',') || 'R0';
      const s = sipd.get(op.kunci);
      const d = tersimpanPerKunci.get(op.kunci);
      const info = s
        ? { skpdId: s.skpdId, kodeSubkegiatan: s.kodeSubkegiatan, namaSubkegiatan: s.namaSubkegiatan }
        : d
          ? { skpdId: String(d.skpdId), kodeSubkegiatan: d.kodeSubkegiatan, namaSubkegiatan: d.namaSubkegiatan }
          : infoKunci(op.kunci);
      docs.push({
        batchId: batch._id,
        kunci: op.kunci,
        aturan,
        skpdId: info.skpdId ? oid(info.skpdId) : undefined,
        kodeSubkegiatan: info.kodeSubkegiatan,
        namaSubkegiatan: info.namaSubkegiatan,
        sebelum: d ? { pagu: d.pagu, alokasi: d.alokasi.map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai })) } : null,
        sesudah: s ? { pagu: s.pagu, alokasi: s.alokasi } : null,
        operasi: { ...op, versi: versi.get(op.kunci) ?? null },
      });
    }
    for (let i = 0; i < docs.length; i += 500) await HasilBanding.insertMany(docs.slice(i, i + 500), { ordered: false });

    // R9: satu notifikasi per rujukan yang belum ada di master; PD: nama perangkat daerah berbeda dengan master
    const JENIS_R9 = { subkegiatan: 'Subkegiatan', sumberDana: 'Sumber dana', skpd: 'SKPD', subUnit: 'Sub unit' } as const;
    const daftarBeda = [
      ...perbedaanNama.skpd.map((x) => ({ ...x, catatan: undefined as string | undefined, j: 'SKPD' })),
      ...perbedaanNama.subUnit.map((x) => ({ ...x, j: 'Sub unit' })),
    ];
    await terapkanCalon(
      [
        ...(Object.keys(JENIS_R9) as (keyof typeof JENIS_R9)[]).flatMap((j) =>
          rujukanHilang[j].map((r) => ({
            kunciUnik: `R9:${batch._id}:${j}:${r.kode}`,
            aturan: 'R9',
            tingkat: 'peringatan' as const,
            pesan: `${JENIS_R9[j]} ${r.kode} ${r.nama} di impor ${batch.namaFile} belum ada di master (${r.baris} baris ditahan)`,
            tautan: `/impor/${batch._id}#rujukan`,
            batchId: batch._id,
            detail: { kode: r.kode, jenis: j },
          })),
        ),
        ...daftarBeda.map((x) => ({
          kunciUnik: `PD:${batch._id}:${x.kode}`,
          aturan: 'PD',
          tingkat: 'info' as const,
          pesan: `${x.j} ${x.kode}: di master "${x.namaMaster}", di SIPD "${x.namaFile}"${x.catatan ? ` (${x.catatan})` : ''}`,
          tautan: `/impor/${batch._id}#rujukan`,
          batchId: batch._id,
          detail: { kode: x.kode, namaMaster: x.namaMaster, namaFile: x.namaFile },
        })),
      ],
      { aturan: ['R9', 'PD'], batchId: batch._id, tahapanId: tahapan._id },
    );

    await set({
      status: 'pratinjau',
      progres: 100,
      ringkasan: {
        ...ringkasan,
        rujukanHilang,
        perbedaanNama,
        versi: undefined,
        jumlahSubkegiatanFile: sipd.size,
        jumlahSubkegiatanTersimpan: tersimpan.size,
        operasi: hitungOp,
        // subkegiatan di file yang isinya sama dengan yang tersimpan: tidak diproses
        tidakBerubah: Math.max(0, sipd.size - hitungOp.tambah - hitungOp.ubah),
        temuan: hitungAturan,
        tidakAdaPerubahan: hasil.operasi.length === 0,
      },
    });
  } catch (e) {
    const pesan =
      e instanceof GalatFormat
        ? `Kolom wajib tidak ditemukan: ${e.kolomHilang.join(', ')}`
        : e instanceof Error
          ? e.message
          : String(e);
    await set({ status: 'gagal', galat: pesan, progres: 100 });
  }
}

/* ------------------------------------------------------------------ */
/* Job imporApbd:terapkan                                              */
/* ------------------------------------------------------------------ */

type OperasiTersimpan = Operasi & { versi?: string | null };

function keDokumen(set: Record<string, unknown>) {
  const o: Record<string, unknown> = { ...set };
  if (Array.isArray(o.alokasi)) o.alokasi = (o.alokasi as { sumberDanaId: string }[]).map((a) => ({ ...a, sumberDanaId: oid(a.sumberDanaId) }));
  if (Array.isArray(o.alokasiSipd))
    o.alokasiSipd = (o.alokasiSipd as { sumberDanaId: string }[]).map((a) => ({ ...a, sumberDanaId: oid(a.sumberDanaId) }));
  if (o.beda && typeof o.beda === 'object') {
    const b = { ...(o.beda as Record<string, unknown>) };
    if (b.oleh) b.oleh = oid(b.oleh);
    if (b.pada) b.pada = new Date(b.pada as string);
    o.beda = b;
  }
  return o;
}

/** Terapkan pratinjau dalam satu transaksi. Gagal di tengah = data lama utuh. */
export async function terapkanApbd(batchId: string, opsi: { gagalkanSetelah?: number } = {}) {
  await sambung();
  let tahapanId: unknown;
  try {
    const hasil = await dalamTransaksi(async (session) => {
      const b = await ImporBatch.findOneAndUpdate(
        { _id: oid(batchId), status: 'pratinjau' },
        { $set: { status: 'diterapkan', diterapkanPada: new Date(), 'ringkasan.sedangDiterapkan': false } },
        { session, new: true },
      ).lean<ImporBatchDoc>();
      if (!b) return null;
      tahapanId = b.tahapanId;
      await pastikanTahapanTerbuka(b.tahapanId, session);
      const sekarang = new Date();
      let ops: AnyBulkWriteOperation<SubkegiatanTahapanDoc>[] = [];
      let diharapkan = 0;
      let cocok = 0;
      let disisipkan = 0;
      let dioperasikan = 0;
      const kirim = async () => {
        if (!ops.length) return;
        const r = await SubkegiatanTahapan.bulkWrite(ops, { session, ordered: true });
        cocok += r.matchedCount;
        disisipkan += r.insertedCount;
        ops = [];
      };
      const cursor = HasilBanding.find({ batchId: b._id }).session(session).lean().cursor();
      for await (const h of cursor) {
        const op = h.operasi as unknown as OperasiTersimpan;
        if (!op) continue;
        if (opsi.gagalkanSetelah !== undefined && dioperasikan >= opsi.gagalkanSetelah) {
          await kirim();
          throw new Error('Simulasi kegagalan di tengah penerapan');
        }
        dioperasikan++;
        const versiFilter = op.versi ? { updatedAt: new Date(op.versi) } : {};
        if (op.jenis === 'tambah') {
          ops.push({
            insertOne: {
              document: {
                ...(keDokumen(op.data as unknown as Record<string, unknown>) as object),
                tahapanId: b.tahapanId,
                skpdId: oid(op.data.skpdId),
                subUnitId: oid(op.data.subUnitId),
                imporTerakhirId: b._id,
                createdAt: sekarang,
                updatedAt: sekarang,
              } as unknown as SubkegiatanTahapanDoc,
            },
          });
        } else if (op.jenis === 'ubah') {
          diharapkan++;
          ops.push({
            updateOne: {
              filter: { _id: oid(op.id), ...versiFilter },
              update: { $set: { ...keDokumen(op.set as Record<string, unknown>), imporTerakhirId: b._id, updatedAt: sekarang } },
            },
          });
        } else {
          diharapkan++;
          ops.push({
            updateOne: {
              filter: { _id: oid(op.id), ...versiFilter },
              update: { $set: { status: 'tidak_ada_di_impor', imporTerakhirId: b._id, updatedAt: sekarang } },
            },
          });
        }
        if (ops.length >= 500) await kirim();
      }
      await kirim();
      const dilewati = diharapkan - cocok;
      await ImporBatch.updateOne(
        { _id: b._id },
        { $set: { 'ringkasan.hasilTerapkan': { disisipkan, diperbarui: cocok, dilewatiKarenaBerubah: dilewati } } },
        { session },
      );
      await catatAudit(
        {
          aksi: 'terapkan_impor',
          koleksi: 'subkegiatanTahapan',
          dokumenId: b._id,
          sesudah: { batchId: String(b._id), namaFile: b.namaFile, disisipkan, diperbarui: cocok, dilewati },
        },
        session,
      );
      return { tahapanId: String(b.tahapanId), disisipkan, diperbarui: cocok, dilewati };
    });
    if (hasil) await segarkanNotifikasi(hasil.tahapanId);
    return hasil;
  } catch (e) {
    await ImporBatch.updateOne(
      { _id: oid(batchId) },
      { $set: { status: 'gagal', galat: `Gagal menerapkan: ${(e as Error).message}. Data lama tidak berubah.`, 'ringkasan.sedangDiterapkan': false } },
    );
    void tahapanId;
    throw e;
  }
}

export { muatTahapan };
