import { ImporBatch, ImporBaris, Nomenklatur, Skpd, SubUnit, SumberDana, catatAudit, oid, sambung, type ImporBatchDoc } from '@danboy/db';
import { pastikanBoleh, type Aksi, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { indukKode } from '../kode';
import { indukNomenklatur, type JenisNomenklatur } from '../nomenklatur';
import { tambahJob } from './antrean';
import { pastikanId } from './umum';

export type KategoriRujukan = 'subkegiatan' | 'sumber_dana' | 'perangkat_daerah';

/** Master mana yang boleh dilengkapi siapa: nomenklatur & perangkat daerah = Super Admin, sumber dana = Admin Keuangan. */
const IZIN: Record<KategoriRujukan, Aksi> = {
  subkegiatan: 'kelola_nomenklatur',
  sumber_dana: 'kelola_sumber_dana',
  perangkat_daerah: 'kelola_skpd',
};

type DataBaris = Record<string, string | string[] | number | null | undefined>;

/**
 * Tambahkan ke master data yang dirujuk impor APBD tetapi belum ada, memakai kode dan nama dari file SIPD,
 * lalu proses ulang batch agar baris yang tadinya ditahan ikut tertaut.
 */
export async function lengkapiMasterDariImpor(user: SessionUser, batchId: string, kategori: KategoriRujukan) {
  if (!IZIN[kategori]) throw new Galat('VALIDASI', 'Kategori tidak dikenal');
  pastikanBoleh(user, IZIN[kategori]);
  await sambung();
  const b = await ImporBatch.findById(pastikanId(batchId, 'Batch')).lean<ImporBatchDoc>();
  if (!b || b.jenis !== 'apbd') throw tidakDitemukan('Batch impor APBD');
  if (b.status !== 'pratinjau') throw new Galat('DATA_BERUBAH', 'Hanya batch pratinjau yang bisa dilengkapi');

  const rujukan = kategori === 'perangkat_daerah' ? ['skpd', 'sub_unit'] : [kategori];
  const ditahan = (await ImporBaris.find({ batchId: b._id, status: 'ditahan', 'data.rujukan': { $in: rujukan } }).select('data').lean()).map(
    (x) => x.data as DataBaris,
  );
  if (!ditahan.length) throw new Galat('VALIDASI', 'Tidak ada rujukan yang perlu ditambahkan');

  let ditambahkan: string[] = [];
  if (kategori === 'subkegiatan') ditambahkan = await lengkapiNomenklatur(b, ditahan);
  else if (kategori === 'sumber_dana') ditambahkan = await lengkapiSumberDana(ditahan);
  else ditambahkan = await lengkapiPerangkatDaerah(ditahan);

  await catatAudit({ aksi: 'lengkapi_master_dari_impor', koleksi: kategori === 'subkegiatan' ? 'nomenklatur' : kategori === 'sumber_dana' ? 'sumberDana' : 'skpd', dokumenId: b._id, sesudah: { namaFile: b.namaFile, ditambahkan } });

  // proses ulang agar baris yang tadinya ditahan kini tertaut ke master
  await ImporBatch.updateOne({ _id: b._id, status: 'pratinjau' }, { $set: { status: 'diunggah', progres: 0, galat: null } });
  await tambahJob('imporApbd:proses', { batchId: String(b._id), userId: user.id });
  return { ditambahkan: ditambahkan.length, kode: ditambahkan };
}

async function lengkapiNomenklatur(b: ImporBatchDoc, ditahan: DataBaris[]) {
  // nama tiap tingkat hierarki diambil dari kolom file (KODE/NAMA URUSAN, BIDANG URUSAN, PROGRAM, KEGIATAN, SUB KEGIATAN)
  const nama = new Map<string, string>();
  for await (const x of ImporBaris.find({ batchId: b._id }).select('data').lean().cursor()) {
    const d = x.data as DataBaris;
    for (const [k, n] of [
      ['kodeUrusan', 'namaUrusan'],
      ['kodeBidang', 'namaBidang'],
      ['kodeProgram', 'namaProgram'],
      ['kodeKegiatan', 'namaKegiatan'],
      ['kodeSubkegiatan', 'namaSubkegiatan'],
    ]) {
      const kode = String(d[k] ?? '');
      const nm = String(d[n] ?? '').trim();
      if (kode && nm && !nama.has(kode)) nama.set(kode, nm);
    }
  }
  const aktif = new Set((await Nomenklatur.find({ aktif: true }).select('kode').lean()).map((n) => n.kode));
  const versi = (await Nomenklatur.findOne({ aktif: true }).sort({ updatedAt: -1 }).select('versi').lean())?.versi ?? 'manual';
  const urutan: JenisNomenklatur[] = ['subkegiatan', 'kegiatan', 'program', 'bidang', 'urusan'];
  const dibuat = new Map<string, { jenis: JenisNomenklatur; kode: string; nama: string; indukKode?: string }>();
  const kurang: string[] = [];
  for (const kodeSub of new Set(ditahan.map((d) => String(d.kodeSubkegiatan)))) {
    let kode: string | undefined = kodeSub;
    for (const jenis of urutan) {
      if (!kode || aktif.has(kode) || dibuat.has(kode)) break;
      const nm = nama.get(kode);
      const induk = indukNomenklatur(jenis, kode);
      if (!nm) {
        kurang.push(`${jenis} ${kode}`);
        break;
      }
      dibuat.set(kode, { jenis, kode, nama: nm, ...(induk ? { indukKode: induk } : {}) });
      kode = induk;
    }
  }
  if (kurang.length)
    throw new Galat(
      'VALIDASI',
      `Nama ${kurang.slice(0, 5).join(', ')}${kurang.length > 5 ? ' dan lainnya' : ''} tidak ada di file; tambahkan manual di Master Nomenklatur lalu proses ulang`,
      { kurang },
    );
  const ops = [...dibuat.values()].map((n) => ({
    updateOne: { filter: { versi, kode: n.kode }, update: { $set: { jenis: n.jenis, nama: n.nama, indukKode: n.indukKode ?? null, aktif: true } }, upsert: true },
  }));
  if (ops.length) await Nomenklatur.bulkWrite(ops as never);
  return [...dibuat.keys()];
}

async function lengkapiSumberDana(ditahan: DataBaris[]) {
  const ada = new Set((await SumberDana.find().select('kode').lean()).map((s) => s.kode));
  const baru = new Map<string, string>();
  for (const d of ditahan) {
    const kode = String(d.kodeSumberDana ?? '');
    if (kode && !ada.has(kode) && !baru.has(kode)) baru.set(kode, String(d.namaSumberDana || kode));
  }
  if (baru.size)
    await SumberDana.bulkWrite(
      [...baru].map(([kode, nama]) => ({
        updateOne: { filter: { kode }, update: { $setOnInsert: { kode, nama, indukKode: indukKode(kode) ?? null, khusus: false, aktif: true } }, upsert: true },
      })) as never,
    );
  return [...baru.keys()];
}

async function lengkapiPerangkatDaerah(ditahan: DataBaris[]) {
  const skpd = new Map((await Skpd.find().select('kode').lean()).map((s) => [s.kode, s._id]));
  const subUnit = new Set((await SubUnit.find().select('kode').lean()).map((s) => s.kode));
  const ditambahkan: string[] = [];
  for (const d of ditahan) {
    const kodeSkpd = String(d.kodeSkpd ?? '');
    if (kodeSkpd && !skpd.has(kodeSkpd)) {
      const s = await Skpd.create({ kode: kodeSkpd, nama: String(d.namaSkpd || kodeSkpd) });
      skpd.set(kodeSkpd, s._id);
      ditambahkan.push(kodeSkpd);
    }
  }
  for (const d of ditahan) {
    const kodeSu = String(d.kodeSubUnit ?? '');
    if (kodeSu && !subUnit.has(kodeSu)) {
      await SubUnit.create({ kode: kodeSu, nama: String(d.namaSubUnit || kodeSu), skpdId: oid(skpd.get(String(d.kodeSkpd))) });
      subUnit.add(kodeSu);
      ditambahkan.push(kodeSu);
    }
  }
  return ditambahkan;
}
