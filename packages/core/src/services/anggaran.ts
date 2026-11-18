import type { ClientSession, PipelineStage } from 'mongoose';
import {
  HasilBanding,
  LogAudit,
  Nomenklatur,
  PaguSumberDana,
  Skpd,
  SubUnit,
  SubkegiatanTahapan,
  SumberDana,
  Tagging,
  catatAudit,
  dalamTransaksi,
  oid,
  sambung,
  type SubkegiatanTahapanDoc,
  type SumberDanaDoc,
} from '@danboy/db';
import type { AlokasiInput, FilterSubkegiatan, SubkegiatanBaru } from '@danboy/schema';
import { dalamCakupan, pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { hashKomposisi, ikutSipd as hitungIkutSipd, terapkanEditAdmin, urutkan } from '../pembanding';
import { statusSumberDana, type StatusSumberDana } from '../rekap';
import { adalahKodeSubkegiatan, kandidatKodeNomenklatur, normalisasiKode } from '../kode';
import { segarkanNotifikasi, segarkanNotifikasiSebagian } from './notifikasi';
import { ambangMendekati, cakupanDb, escapeRegex, muatTahapan, pastikanId, pastikanTahapanTerbuka } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface BarisRekap {
  sumberDanaId: string;
  kode: string;
  nama: string;
  khusus: boolean;
  pagu: number | null;
  terpakai: number;
  sisa: number | null;
  jumlahSubkegiatan: number;
  status: StatusSumberDana;
  persen: number | null;
}

async function terpakaiPerSumberDana(tahapanId: ReturnType<typeof oid>, filterTambahan: Record<string, unknown> = {}, session?: ClientSession) {
  const rows = await SubkegiatanTahapan.aggregate<{ _id: unknown; terpakai: number; jumlahSubkegiatan: number }>([
    { $match: { tahapanId, status: 'aktif', ...filterTambahan } },
    { $unwind: '$alokasi' },
    { $match: { 'alokasi.nilai': { $gt: 0 } } },
    { $group: { _id: '$alokasi.sumberDanaId', terpakai: { $sum: '$alokasi.nilai' }, jumlahSubkegiatan: { $sum: 1 } } },
  ]).session(session ?? null);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/**
 * Rekap pagu, terpakai, sisa, status per sumber dana — dihitung langsung dari SubkegiatanTahapan, tidak disimpan.
 * Status R3 dihitung terhadap pemakaian seluruh pemda; akun SKPD hanya melihat sumber dana yang dipakai SKPD-nya
 * dan kolom terpakaiSkpd berisi bagian SKPD-nya.
 */
export async function rekapSumberDana(user: SessionUser, tahapanId: string) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const [global, pagu, sdList, milikSaya] = await Promise.all([
    terpakaiPerSumberDana(t._id),
    PaguSumberDana.find({ tahapanId: t._id }).lean(),
    SumberDana.find().lean<SumberDanaDoc[]>(),
    user.peran === 'skpd' ? terpakaiPerSumberDana(t._id, cakupanDb(user)) : Promise.resolve(null),
  ]);
  const paguPer = new Map(pagu.map((p) => [String(p.sumberDanaId), p.nilai]));
  const sdPer = new Map(sdList.map((s) => [String(s._id), s]));
  const ids = new Set([...global.keys(), ...paguPer.keys()]);
  const ambang = ambangMendekati();
  const baris: (BarisRekap & { terpakaiSkpd?: number })[] = [];
  for (const id of ids) {
    if (milikSaya && !milikSaya.has(id)) continue;
    const sd = sdPer.get(id);
    const p = paguPer.has(id) ? paguPer.get(id)! : null;
    const terpakai = global.get(id)?.terpakai ?? 0;
    baris.push({
      sumberDanaId: id,
      kode: sd?.kode ?? '?',
      nama: sd?.nama ?? '(sumber dana terhapus)',
      khusus: !!sd?.khusus,
      pagu: p,
      terpakai,
      sisa: p === null ? null : p - terpakai,
      jumlahSubkegiatan: (milikSaya ?? global).get(id)?.jumlahSubkegiatan ?? 0,
      status: statusSumberDana(p, terpakai, ambang),
      persen: p ? Math.round((terpakai / p) * 1000) / 10 : null,
      ...(milikSaya ? { terpakaiSkpd: milikSaya.get(id)?.terpakai ?? 0 } : {}),
    });
  }
  baris.sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
  const total = {
    pagu: baris.reduce((a, b) => a + (b.pagu ?? 0), 0),
    terpakai: baris.reduce((a, b) => a + b.terpakai, 0),
    melebihi: baris.filter((b) => b.status === 'melebihi').length,
    mendekati: baris.filter((b) => b.status === 'mendekati').length,
    komplit: baris.filter((b) => b.status === 'komplit').length,
    belumDiisi: baris.filter((b) => b.status === 'pagu_belum_diisi').length,
  };
  return { tahapan: ser(t), baris, total, ambang };
}

/** Daftar subkegiatan pemakai satu sumber dana, urut nilai menurun, paginasi 50. */
export async function subkegiatanPerSumberDana(user: SessionUser, tahapanId: string, sumberDanaId: string, page = 1, limit = 50) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const sd = oid(pastikanId(sumberDanaId, 'Sumber dana'));
  const match = { tahapanId: t._id, status: 'aktif', 'alokasi.sumberDanaId': sd, ...cakupanDb(user) };
  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        nilaiSd: {
          $sum: { $map: { input: { $filter: { input: '$alokasi', cond: { $eq: ['$$this.sumberDanaId', sd] } } }, in: '$$this.nilai' } },
        },
      },
    },
    { $sort: { nilaiSd: -1, kodeSubkegiatan: 1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $lookup: { from: 'skpd', localField: 'skpdId', foreignField: '_id', as: 'skpd' } },
    { $lookup: { from: 'subUnit', localField: 'subUnitId', foreignField: '_id', as: 'subUnit' } },
    { $project: { rincian: 0, alokasiSipd: 0 } },
  ];
  const [data, total, sdDoc] = await Promise.all([
    SubkegiatanTahapan.aggregate(pipeline),
    SubkegiatanTahapan.countDocuments(match),
    SumberDana.findById(sd).lean(),
  ]);
  return ser({ sumberDana: sdDoc, data: data.map((d) => ({ ...d, skpd: d.skpd[0], subUnit: d.subUnit[0] })), total, page, limit });
}

/**
 * Id subkegiatan yang "beda dengan tagging", dua arah:
 *  - R6: ada di daftar tagging tahun itu, tetapi tidak satu pun sumber dana tagging-nya dipakai
 *    (tertagging untuk beberapa sumber dana dan sudah didanai salah satunya = sesuai);
 *  - R5: memakai sumber dana khusus, padahal tidak ditagging untuk sumber dana itu.
 * "Dipakai" = alokasi bernilai > 0. Dihitung saat diminta, tidak disimpan.
 */
async function idBedaTagging(user: SessionUser, t: { _id: ReturnType<typeof oid>; tahun: number }) {
  const [tagging, docs, khusus] = await Promise.all([
    Tagging.find({ tahun: t.tahun }).select('sumberDanaId kodeSubkegiatan').lean(),
    SubkegiatanTahapan.find({ tahapanId: t._id, ...cakupanDb(user) }).select('kodeSubkegiatan alokasi').lean<SubkegiatanTahapanDoc[]>(),
    SumberDana.find({ khusus: true }).distinct('_id').then((ids) => new Set(ids.map(String))),
  ]);
  const sdPerKode = new Map<string, Set<string>>();
  for (const x of tagging) {
    const set = sdPerKode.get(x.kodeSubkegiatan) ?? new Set<string>();
    set.add(String(x.sumberDanaId));
    sdPerKode.set(x.kodeSubkegiatan, set);
  }
  return docs
    .filter((d) => {
      const dipakai = new Set(d.alokasi.filter((a) => a.nilai > 0).map((a) => String(a.sumberDanaId)));
      const tagging = new Set(kandidatKodeNomenklatur(d.kodeSubkegiatan).flatMap((k) => [...(sdPerKode.get(k) ?? [])]));
      return (tagging.size > 0 && ![...tagging].some((sid) => dipakai.has(sid))) || [...dipakai].some((sid) => khusus.has(sid) && !tagging.has(sid));
    })
    .map((d) => d._id);
}

/**
 * Tahap agregasi pengganti populate(): SKPD, sub unit, dan sumber dana tiap alokasi digabung di server dalam satu
 * permintaan (populate butuh satu putaran tambahan ke basis data). Bentuk hasilnya sama dengan populate.
 */
function tahapGabung(opsi: { sumberDana: boolean }): PipelineStage[] {
  const tahap: PipelineStage[] = [
    { $lookup: { from: 'skpd', localField: 'skpdId', foreignField: '_id', as: 'skpdId', pipeline: [{ $project: { kode: 1, nama: 1 } }] } },
    { $lookup: { from: 'subUnit', localField: 'subUnitId', foreignField: '_id', as: 'subUnitId', pipeline: [{ $project: { kode: 1, nama: 1 } }] } },
    { $set: { skpdId: { $ifNull: [{ $first: '$skpdId' }, null] }, subUnitId: { $ifNull: [{ $first: '$subUnitId' }, null] } } },
  ];
  if (opsi.sumberDana)
    tahap.push(
      { $lookup: { from: 'sumberDana', localField: 'alokasi.sumberDanaId', foreignField: '_id', as: '_sd', pipeline: [{ $project: { kode: 1, nama: 1, khusus: 1 } }] } },
      {
        $set: {
          alokasi: {
            $map: {
              input: '$alokasi',
              as: 'a',
              in: {
                $mergeObjects: [
                  '$$a',
                  { sumberDanaId: { $ifNull: [{ $first: { $filter: { input: '$_sd', as: 's', cond: { $eq: ['$$s._id', '$$a.sumberDanaId'] } } } }, null] } },
                ],
              },
            },
          },
        },
      },
      { $unset: '_sd' },
    );
  return tahap;
}

/** filterDaftar + saringan yang butuh data lain (beda dengan tagging). */
async function filterDaftarLengkap(user: SessionUser, t: { _id: ReturnType<typeof oid>; tahun: number }, f: Partial<FilterSubkegiatan>) {
  const filter = filterDaftar(user, t._id, f);
  if (f.bedaTagging) filter._id = { $in: await idBedaTagging(user, t) };
  return filter;
}

function filterDaftar(user: SessionUser, tahapanId: ReturnType<typeof oid>, f: Partial<FilterSubkegiatan>) {
  const filter: Record<string, unknown> = { tahapanId, ...cakupanDb(user) };
  if (f.skpd && user.peran !== 'skpd') filter.skpdId = oid(f.skpd);
  if (f.subUnit) filter.subUnitId = oid(f.subUnit);
  if (f.sumberDana) filter['alokasi.sumberDanaId'] = oid(f.sumberDana);
  if (f.status === 'tidak_seimbang') Object.assign(filter, { seimbang: false, status: 'aktif' });
  else if (f.status === 'beda') filter['beda.ada'] = true;
  else if (f.status === 'tidak_ada_di_impor') filter.status = 'tidak_ada_di_impor';
  const syaratJumlahSd = { satu: ['$eq', 1], dua_lebih: ['$gte', 2], lebih_dua: ['$gte', 3] } as const;
  if (f.jumlahSd && f.jumlahSd in syaratJumlahSd) {
    // banyaknya sumber dana = alokasi bernilai > 0
    const [op, n] = syaratJumlahSd[f.jumlahSd];
    filter.$expr = { [op]: [{ $size: { $filter: { input: '$alokasi', cond: { $gt: ['$$this.nilai', 0] } } } }, n] };
  }
  if (f.q) {
    const q = escapeRegex(f.q);
    filter.$or = [{ kodeSubkegiatan: { $regex: `^${q}` } }, { namaSubkegiatan: { $regex: q, $options: 'i' } }];
  }
  return filter;
}

/**
 * Jumlah pagu dan alokasi (per sumber dana) atas seluruh hasil saringan, bukan hanya halaman tampil.
 * Subkegiatan yang tidak ada di impor terakhir tidak ikut dijumlah, kecuali saringan memilih status itu.
 */
async function jumlahDaftar(filter: Record<string, unknown>) {
  const match = filter.status === 'tidak_ada_di_impor' ? filter : { ...filter, status: 'aktif' };
  const [r] = await SubkegiatanTahapan.aggregate<{ pagu: { _id: null; nilai: number }[]; perSd: { _id: unknown; nilai: number }[] }>([
    { $match: match },
    {
      $facet: {
        pagu: [{ $group: { _id: null, nilai: { $sum: '$pagu' } } }],
        perSd: [{ $unwind: '$alokasi' }, { $group: { _id: '$alokasi.sumberDanaId', nilai: { $sum: '$alokasi.nilai' } } }],
      },
    },
  ]);
  const perSd = Object.fromEntries((r?.perSd ?? []).map((k) => [String(k._id), k.nilai]));
  return { pagu: r?.pagu[0]?.nilai ?? 0, alokasi: Object.values(perSd).reduce((a, b) => a + b, 0), perSd };
}

export async function daftarSubkegiatan(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const filter = await filterDaftarLengkap(user, t, f);
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total, jumlah] = await Promise.all([
    SubkegiatanTahapan.aggregate([
      { $match: filter },
      { $sort: { kodeSubkegiatan: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { rincian: 0 } },
      ...tahapGabung({ sumberDana: true }),
    ]),
    SubkegiatanTahapan.countDocuments(filter),
    jumlahDaftar(filter),
  ]);
  return ser({ data, total, page, limit, jumlah: { pagu: jumlah.pagu, alokasi: jumlah.alokasi } });
}

async function muatSubkegiatan(user: SessionUser, id: string, session?: ClientSession) {
  const d = await SubkegiatanTahapan.findById(pastikanId(id, 'Subkegiatan')).session(session ?? null).lean<SubkegiatanTahapanDoc>();
  // dokumen di luar cakupan SKPD = 404, agar keberadaan data SKPD lain tidak terungkap
  if (!d || !dalamCakupan(user, d)) throw tidakDitemukan('Subkegiatan');
  return d;
}

export async function detailSubkegiatan(user: SessionUser, id: string) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const d = await muatSubkegiatan(user, id);
  const sdIds = new Set([...d.alokasi.map((a) => String(a.sumberDanaId)), ...(d.alokasiSipd ?? []).map((a) => String(a.sumberDanaId))]);
  // semua dibaca bersamaan; data rujukan (sumber dana, nama pengguna) digabung di sini, bukan lewat populate
  const [t, skpd, subUnit, semuaSd, taggingSemuaTahun, nomenklatur, riwayatMentah, riwayatImpor] = await Promise.all([
    muatTahapan(d.tahapanId),
    Skpd.findById(d.skpdId).lean(),
    SubUnit.findById(d.subUnitId).lean(),
    SumberDana.find().lean<SumberDanaDoc[]>(),
    // tagging kode ini untuk semua tahun (sedikit), disaring per tahun tahapan di bawah agar tidak menunggu tahapan
    Tagging.find({ kodeSubkegiatan: { $in: kandidatKodeNomenklatur(d.kodeSubkegiatan) } }).lean(),
    Nomenklatur.find({ kode: { $in: kandidatKodeNomenklatur(d.kodeSubkegiatan) }, aktif: true })
      .lean()
      .then((xs) => xs.sort((a, b) => (a.kode === d.kodeSubkegiatan ? -1 : b.kode === d.kodeSubkegiatan ? 1 : 0))[0] ?? null),
    LogAudit.aggregate([
      { $match: { koleksi: 'subkegiatanTahapan', dokumenId: d._id } },
      { $sort: { waktu: -1 } },
      { $limit: 30 },
      { $lookup: { from: 'user', localField: 'userId', foreignField: '_id', as: 'userId', pipeline: [{ $project: { nama: 1, username: 1 } }] } },
      { $set: { userId: { $ifNull: [{ $first: '$userId' }, null] } } },
    ]),
    HasilBanding.aggregate([
      { $match: { kunci: `${d.subUnitId}|${d.kodeSubkegiatan}` } },
      { $sort: { _id: -1 } },
      { $limit: 10 },
      { $project: { batchId: 1, aturan: 1, sebelum: 1, sesudah: 1 } },
      {
        $lookup: {
          from: 'imporBatch',
          localField: 'batchId',
          foreignField: '_id',
          as: 'batchId',
          pipeline: [{ $match: { tahapanId: d.tahapanId, status: 'diterapkan' } }, { $project: { namaFile: 1, status: 1, diterapkanPada: 1, tahapanId: 1 } }],
        },
      },
      { $set: { batchId: { $ifNull: [{ $first: '$batchId' }, null] } } },
    ]),
  ]);
  const riwayat = riwayatMentah;
  const taggingMentah = taggingSemuaTahun.filter((x) => x.tahun === t.tahun);
  const sdSemuaPer = new Map(semuaSd.map((s) => [String(s._id), s]));
  const sdList = semuaSd.filter((s) => sdIds.has(String(s._id)));
  const tagging = taggingMentah.map((x) => {
    const sd = sdSemuaPer.get(String(x.sumberDanaId));
    return { ...x, sumberDanaId: sd ? { _id: sd._id, kode: sd.kode, nama: sd.nama } : null };
  });
  const sdPer = Object.fromEntries(sdList.map((s) => [String(s._id), s]));
  const taggingSd = new Set(tagging.map((x) => String((x.sumberDanaId as unknown as { _id: unknown })?._id ?? x.sumberDanaId)));
  // R6: tertagging untuk sumber dana khusus tertentu, tetapi didanai sumber lain (dihitung saat tampil).
  // Tertagging untuk beberapa sumber dana dan sudah didanai salah satunya = sesuai, tidak ada R6.
  const pakaiTagging = d.alokasi.some((a) => a.nilai > 0 && taggingSd.has(String(a.sumberDanaId)));
  const r6 = (pakaiTagging ? [] : tagging)
    .filter((x) => {
      const sid = String((x.sumberDanaId as unknown as { _id: unknown })?._id ?? x.sumberDanaId);
      return !d.alokasi.some((a) => String(a.sumberDanaId) === sid && a.nilai > 0);
    })
    .map((x) => (x.sumberDanaId as unknown as { nama: string })?.nama);
  return ser({
    ...d,
    tahapan: t,
    skpd,
    subUnit,
    sumberDana: sdPer,
    tagging,
    taggingSd: [...taggingSd],
    r6: [...new Set(r6)],
    nomenklatur,
    riwayat,
    riwayatImpor: riwayatImpor.filter((r) => r.batchId),
  });
}

/* ---------- Tambah subkegiatan manual (Admin) ---------- */

const kodeX = (kode: string) => kode.toUpperCase().startsWith('X.');

/** Daftar tagging (semua sumber dana) untuk sebuah kode subkegiatan, termasuk yang ditulis dengan pola X.XX. */
async function taggingKode(tahun: number, kode: string) {
  const rows = await Tagging.find({ tahun, kodeSubkegiatan: { $in: kandidatKodeNomenklatur(kode) } }).populate('sumberDanaId', 'kode nama').lean();
  return rows.map((x) => {
    const sd = x.sumberDanaId as unknown as { _id: unknown; kode: string; nama: string } | null;
    return { sumberDanaId: String(sd?._id ?? x.sumberDanaId), sumberDana: sd?.nama ?? '?', kategori: x.kategori, rincian: x.rincian };
  });
}

/** Bidang urusan di master nomenklatur (tanpa X.XX): pilihan pengganti X.XX saat menambah subkegiatan penunjang. */
export async function daftarBidangUrusan(user: SessionUser) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const data = await Nomenklatur.find({ jenis: 'bidang', aktif: true }).select('kode nama').lean();
  return data
    .filter((d) => !kodeX(d.kode))
    .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }))
    .map((d) => ({ kode: d.kode, nama: d.nama }));
}

/**
 * Bahan formulir tambah subkegiatan: tanpa `kode` = pencarian subkegiatan di master nomenklatur;
 * dengan `kode` (kode akhir) = info tagging dan sub unit yang sudah memilikinya pada tahapan ini.
 */
export async function calonSubkegiatan(user: SessionUser, tahapanId: string, opsi: { q?: string; kode?: string }) {
  pastikanBoleh(user, 'impor');
  const t = await muatTahapan(tahapanId);
  if (opsi.kode) {
    const kode = normalisasiKode(opsi.kode);
    const [tagging, ada] = await Promise.all([
      taggingKode(t.tahun, kode),
      SubkegiatanTahapan.find({ tahapanId: t._id, kodeSubkegiatan: kode }).select('subUnitId').lean(),
    ]);
    return ser({ kode, tagging, sudahAda: ada.map((a) => String(a.subUnitId)) });
  }
  return { data: await cariNomenklaturSubkegiatan(opsi.q) };
}

/** Pencarian subkegiatan aktif di master nomenklatur (awal kode atau sebagian nama), maks. 30 baris. */
async function cariNomenklaturSubkegiatan(qMentah?: string) {
  const q = (qMentah ?? '').trim();
  if (q.length < 2) return [];
  await sambung();
  const data = await Nomenklatur.find({
    aktif: true,
    jenis: 'subkegiatan',
    $or: [{ kode: { $regex: `^${escapeRegex(normalisasiKode(q))}`, $options: 'i' } }, { nama: { $regex: escapeRegex(q), $options: 'i' } }],
  })
    .select('kode nama')
    .sort({ kode: 1 })
    .limit(30)
    .lean();
  return data.map((d) => ({ kode: d.kode, nama: d.nama, templat: kodeX(d.kode) }));
}

/** GET /api/nomenklatur/subkegiatan?q= : bahan formulir tagging (pilih subkegiatan dari master). */
export async function cariSubkegiatanMaster(user: SessionUser, q?: string) {
  pastikanBoleh(user, 'lihat');
  return { data: await cariNomenklaturSubkegiatan(q) };
}

/**
 * POST /api/tahapan/{id}/subkegiatan. Kode dan nama diambil dari master nomenklatur; untuk subkegiatan penunjang
 * (X.XX.…) dua segmen pertama diganti bidang urusan yang dipilih. Tidak ditolak karena tagging; respons membawa
 * daftar tagging agar pengguna tahu subkegiatan itu ditandai untuk sumber dana tertentu.
 */
export async function tambahSubkegiatan(user: SessionUser, tahapanId: string, input: SubkegiatanBaru) {
  pastikanBoleh(user, 'impor');
  const t = await pastikanTahapanTerbuka(tahapanId);
  const subUnit = await SubUnit.findById(pastikanId(input.subUnitId, 'Sub unit')).lean();
  if (!subUnit) throw tidakDitemukan('Sub unit');
  const kodeMaster = normalisasiKode(input.kodeNomenklatur).toUpperCase();
  const master = await Nomenklatur.findOne({ kode: kodeMaster, jenis: 'subkegiatan', aktif: true }).lean();
  if (!master) throw new Galat('VALIDASI', `Subkegiatan ${kodeMaster} tidak ada di master nomenklatur`);
  let kode = master.kode;
  if (kodeX(master.kode)) {
    const bidang = normalisasiKode(input.kodeBidang ?? '');
    if (!bidang) throw new Galat('VALIDASI', 'Pilih bidang urusan untuk subkegiatan penunjang (X.XX)', { kodeBidang: 'Wajib dipilih' });
    if (kodeX(bidang) || !(await Nomenklatur.exists({ kode: bidang, jenis: 'bidang', aktif: true })))
      throw new Galat('VALIDASI', `Bidang urusan ${bidang} tidak ada di master nomenklatur`, { kodeBidang: 'Tidak dikenal' });
    kode = [bidang, ...master.kode.split('.').slice(2)].join('.');
  }
  if (!adalahKodeSubkegiatan(kode)) throw new Galat('VALIDASI', `Kode subkegiatan ${kode} tidak valid`);
  if (input.sumberDanaId && !(await SumberDana.exists({ _id: oid(input.sumberDanaId) }))) throw new Galat('VALIDASI', 'Sumber dana tidak dikenal');
  const sudahAda = () => new Galat('VALIDASI', `Subkegiatan ${kode} sudah ada di ${subUnit.nama}`);
  if (await SubkegiatanTahapan.exists({ tahapanId: t._id, subUnitId: subUnit._id, kodeSubkegiatan: kode })) throw sudahAda();
  const alokasi = input.sumberDanaId && input.pagu > 0 ? [{ sumberDanaId: oid(input.sumberDanaId), nilai: input.pagu, nilaiSipd: 0, asal: 'admin' as const }] : [];
  const baru = await SubkegiatanTahapan.create({
    tahapanId: t._id,
    skpdId: subUnit.skpdId,
    subUnitId: subUnit._id,
    kodeSubkegiatan: kode,
    namaSubkegiatan: master.nama,
    pagu: input.pagu,
    status: 'aktif',
    alokasi,
    alokasiSipd: [],
    beda: { ada: false },
    seimbang: alokasi.reduce((s, a) => s + a.nilai, 0) === input.pagu,
    rincian: [],
  }).catch((e) => {
    if ((e as { code?: number }).code === 11000) throw sudahAda();
    throw e;
  });
  await segarkanNotifikasiSebagian(t._id, { subkegiatanIds: [baru._id] });
  return ser({ dokumen: baru.toObject(), tagging: await taggingKode(t.tahun, kode) });
}

/** PATCH /api/subkegiatan/{id}: ubah pagu. Alokasi sumber dana tidak disentuh, jadi bisa menjadi belum seimbang (R4). */
export async function ubahPaguSubkegiatan(user: SessionUser, id: string, input: { updatedAt: string; pagu: number }) {
  pastikanBoleh(user, 'impor');
  await sambung();
  const d = await muatSubkegiatan(user, id);
  await pastikanTahapanTerbuka(d.tahapanId);
  const berubah = () => new Galat('DATA_BERUBAH', 'Data sudah diubah orang lain. Muat ulang untuk melihat versi terbaru.');
  if (new Date(d.updatedAt).toISOString() !== new Date(input.updatedAt).toISOString()) throw berubah();
  const baru = await SubkegiatanTahapan.findOneAndUpdate(
    { _id: d._id, updatedAt: d.updatedAt },
    { $set: { pagu: input.pagu, seimbang: d.alokasi.reduce((s, a) => s + a.nilai, 0) === input.pagu } },
    { new: true },
  ).lean<SubkegiatanTahapanDoc>();
  if (!baru) throw berubah();
  await segarkanNotifikasiSebagian(d.tahapanId, { subkegiatanIds: [d._id] });
  return ser({ dokumen: baru });
}

/** DELETE /api/subkegiatan/{id}: hapus subkegiatan dari tahapan; isi sebelum dihapus dicatat di log audit. */
export async function hapusSubkegiatan(user: SessionUser, id: string) {
  pastikanBoleh(user, 'impor');
  await sambung();
  const d = await muatSubkegiatan(user, id);
  await pastikanTahapanTerbuka(d.tahapanId);
  await dalamTransaksi(async (session) => {
    const r = await SubkegiatanTahapan.deleteOne({ _id: d._id }, { session });
    if (!r.deletedCount) throw tidakDitemukan('Subkegiatan');
    await catatAudit(
      {
        aksi: 'hapus',
        koleksi: 'subkegiatanTahapan',
        dokumenId: d._id,
        sebelum: { tahapanId: d.tahapanId, skpdId: d.skpdId, subUnitId: d.subUnitId, kodeSubkegiatan: d.kodeSubkegiatan, namaSubkegiatan: d.namaSubkegiatan, pagu: d.pagu, alokasi: d.alokasi },
      },
      session,
    );
  });
  await segarkanNotifikasiSebagian(d.tahapanId, { subkegiatanIds: [d._id], sumberDanaIds: d.alokasi.map((x) => x.sumberDanaId) });
  return { ok: true };
}

/** Sisa pagu sumber dana yang tersentuh, agar tampilan langsung memperbarui angka. */
async function ringkasanSisa(tahapanId: ReturnType<typeof oid>, sdIds: string[], session?: ClientSession) {
  const ids = sdIds.map(oid);
  // pemakaian hanya untuk sumber dana yang tersentuh; ketiga kueri jalan bersamaan
  const [pakai, pagu, sd] = await Promise.all([
    SubkegiatanTahapan.aggregate<{ _id: unknown; terpakai: number }>([
      { $match: { tahapanId, status: 'aktif', 'alokasi.sumberDanaId': { $in: ids } } },
      { $unwind: '$alokasi' },
      { $match: { 'alokasi.sumberDanaId': { $in: ids }, 'alokasi.nilai': { $gt: 0 } } },
      { $group: { _id: '$alokasi.sumberDanaId', terpakai: { $sum: '$alokasi.nilai' } } },
    ]).session(session ?? null),
    PaguSumberDana.find({ tahapanId, sumberDanaId: { $in: ids } }).session(session ?? null).lean(),
    SumberDana.find({ _id: { $in: ids } }).session(session ?? null).lean(),
  ]);
  const terpakai = new Map(pakai.map((p) => [String(p._id), p]));
  const paguPer = new Map(pagu.map((p) => [String(p.sumberDanaId), p.nilai]));
  return sd.map((s) => {
    const id = String(s._id);
    const p = paguPer.has(id) ? paguPer.get(id)! : null;
    const pakai = terpakai.get(id)?.terpakai ?? 0;
    return { sumberDanaId: id, kode: s.kode, nama: s.nama, pagu: p, terpakai: pakai, sisa: p === null ? null : p - pakai, status: statusSumberDana(p, pakai, ambangMendekati()) };
  });
}

/**
 * PUT /api/subkegiatan/{id}/alokasi. Konkurensi optimistis memakai updatedAt dari klien.
 * Tidak pernah ditolak karena pagu sumber dana terlampaui; respons membawa peringatan.
 */
export async function ubahAlokasi(user: SessionUser, id: string, input: AlokasiInput) {
  pastikanBoleh(user, 'ubah_alokasi');
  await sambung();
  const d = await muatSubkegiatan(user, id);
  await pastikanTahapanTerbuka(d.tahapanId);
  if (new Date(d.updatedAt).toISOString() !== new Date(input.updatedAt).toISOString())
    throw new Galat('DATA_BERUBAH', 'Data sudah diubah orang lain. Muat ulang untuk melihat versi terbaru.');
  const ids = input.alokasi.map((a) => a.sumberDanaId);
  const ada = await SumberDana.countDocuments({ _id: { $in: ids.map(oid) } });
  if (ada !== new Set(ids).size) throw new Galat('VALIDASI', 'Ada sumber dana yang tidak dikenal');
  const sipd = (d.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai }));
  const r = terapkanEditAdmin(input.alokasi, sipd, d.pagu);
  const baru = await SubkegiatanTahapan.findOneAndUpdate(
    { _id: d._id, updatedAt: d.updatedAt },
    {
      $set: {
        alokasi: r.alokasi.map((a) => ({ ...a, sumberDanaId: oid(a.sumberDanaId) })),
        seimbang: r.seimbang,
        beda: { ada: false, diputuskan: 'edit_sendiri', hashSipd: r.hash, oleh: oid(user.id), pada: new Date() },
      },
    },
    { new: true },
  ).lean<SubkegiatanTahapanDoc>();
  if (!baru) throw new Galat('DATA_BERUBAH', 'Data sudah diubah orang lain. Muat ulang untuk melihat versi terbaru.');
  await segarkanNotifikasiSebagian(d.tahapanId, { subkegiatanIds: [d._id], sumberDanaIds: d.alokasi.map((x) => x.sumberDanaId) });
  const tersentuh = [...new Set([...ids, ...d.alokasi.map((a) => String(a.sumberDanaId))])];
  const sisa = await ringkasanSisa(d.tahapanId, tersentuh);
  const peringatan = sisa.filter((s) => s.sisa !== null && s.sisa < 0).map((s) => ({ sumberDana: s.nama, lebih: -(s.sisa as number) }));
  return ser({ dokumen: baru, sisa, peringatan });
}

async function ikutSipdSatu(user: SessionUser, d: SubkegiatanTahapanDoc, session: ClientSession) {
  const r = hitungIkutSipd({ pagu: d.pagu, alokasiSipd: (d.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai })) });
  await SubkegiatanTahapan.findOneAndUpdate(
    { _id: d._id },
    {
      $set: {
        alokasi: r.alokasi.map((a) => ({ ...a, sumberDanaId: oid(a.sumberDanaId) })),
        seimbang: r.seimbang,
        beda: { ada: false, diputuskan: 'ikut_sipd', hashSipd: r.hash, oleh: oid(user.id), pada: new Date() },
      },
    },
    { session },
  );
}

export async function ikutSipd(user: SessionUser, id: string) {
  pastikanBoleh(user, 'ubah_alokasi');
  await sambung();
  const d = await muatSubkegiatan(user, id);
  await pastikanTahapanTerbuka(d.tahapanId);
  await dalamTransaksi((s) => ikutSipdSatu(user, d, s));
  await segarkanNotifikasiSebagian(d.tahapanId, { subkegiatanIds: [d._id], sumberDanaIds: d.alokasi.map((x) => x.sumberDanaId) });
  return { ok: true };
}

/** "Ikut SIPD untuk semua": semua dokumen beda.ada = true dalam filter aktif, satu transaksi. */
export async function ikutSipdSemua(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'ubah_alokasi');
  const t = await pastikanTahapanTerbuka(tahapanId);
  const filter = { ...filterDaftar(user, t._id, { ...f, status: undefined }), 'beda.ada': true };
  const jumlah = await dalamTransaksi(async (session) => {
    // cukup pagu dan alokasi SIPD; perubahan dikirim per 500 dalam satu bulkWrite, bukan satu per satu
    const docs = await SubkegiatanTahapan.find(filter).select('pagu alokasiSipd').session(session).lean<Pick<SubkegiatanTahapanDoc, '_id' | 'pagu' | 'alokasiSipd'>[]>();
    const pada = new Date();
    const ops = docs.map((d) => {
      const r = hitungIkutSipd({ pagu: d.pagu, alokasiSipd: (d.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai })) });
      return {
        updateOne: {
          filter: { _id: d._id },
          update: {
            $set: {
              alokasi: r.alokasi.map((a) => ({ ...a, sumberDanaId: oid(a.sumberDanaId) })),
              seimbang: r.seimbang,
              beda: { ada: false, diputuskan: 'ikut_sipd' as const, hashSipd: r.hash, oleh: oid(user.id), pada },
            },
          },
        },
      };
    });
    for (let i = 0; i < ops.length; i += 500) await SubkegiatanTahapan.bulkWrite(ops.slice(i, i + 500), { session, ordered: false });
    await catatAudit({ aksi: 'ikut_sipd_semua', koleksi: 'subkegiatanTahapan', dokumenId: t._id, sesudah: { jumlah: docs.length } }, session);
    return docs.length;
  });
  await segarkanNotifikasi(t._id);
  return { jumlah };
}

export async function daftarPerbedaan(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'lihat_perbedaan');
  return daftarSubkegiatanLengkap(user, tahapanId, { ...f, status: 'beda' });
}

async function daftarSubkegiatanLengkap(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  const t = await muatTahapan(tahapanId);
  const filter = filterDaftar(user, t._id, f);
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total, sd] = await Promise.all([
    SubkegiatanTahapan.aggregate<SubkegiatanTahapanDoc>([
      { $match: filter },
      { $sort: { kodeSubkegiatan: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { rincian: 0 } },
      ...tahapGabung({ sumberDana: false }),
    ]),
    SubkegiatanTahapan.countDocuments(filter),
    // nama semua sumber dana (koleksi kecil) diambil bersamaan agar tidak menunggu daftar selesai
    SumberDana.find().select('kode nama').lean(),
  ]);
  return ser({ data, total, page, limit, sumberDana: Object.fromEntries(sd.map((s) => [String(s._id), s])) });
}

/** Kolom matriks = sumber dana yang dipakai dalam cakupan, digabung di server dalam satu permintaan. */
function kolomMatriks(user: SessionUser, tahapanId: ReturnType<typeof oid>) {
  return SubkegiatanTahapan.aggregate<{ _id: unknown; kode: string; nama: string; khusus: boolean }>([
    { $match: { tahapanId, ...cakupanDb(user) } },
    { $unwind: '$alokasi' },
    { $group: { _id: '$alokasi.sumberDanaId' } },
    { $lookup: { from: 'sumberDana', localField: '_id', foreignField: '_id', as: 'sd' } },
    { $unwind: '$sd' },
    { $replaceWith: { _id: '$sd._id', kode: '$sd.kode', nama: '$sd.nama', khusus: '$sd.khusus' } },
    { $sort: { kode: 1 } },
  ]);
}

/** Baris matriks (urut kode), dengan atau tanpa paginasi. */
function barisMatriks(filter: Record<string, unknown>, halaman?: { skip: number; limit: number }) {
  return SubkegiatanTahapan.aggregate([
    { $match: filter },
    { $sort: { kodeSubkegiatan: 1, _id: 1 } },
    ...(halaman ? [{ $skip: halaman.skip }, { $limit: halaman.limit }] : []),
    { $project: { kodeSubkegiatan: 1, namaSubkegiatan: 1, pagu: 1, alokasi: 1, seimbang: 1, skpdId: 1, subUnitId: 1, beda: 1, status: 1 } },
    ...tahapGabung({ sumberDana: false }),
  ]);
}

/**
 * Semua baris matriks sesuai saringan dalam satu agregasi, untuk unduhan Excel. Bentuk datanya sama dengan
 * gabungan semua halaman matriks(); tidak menghitung total dan tidak mengulang saringan per halaman.
 */
export async function matriksSemua(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const filter = await filterDaftarLengkap(user, t, f);
  const [kolom, data] = await Promise.all([kolomMatriks(user, t._id), barisMatriks(filter).allowDiskUse(true)]);
  return ser({ kolom, data, total: data.length });
}

/** Matriks subkegiatan × sumber dana. Kolom = sumber dana yang dipakai dalam cakupan. */
export async function matriks(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const filter = await filterDaftarLengkap(user, t, f);
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 100, 200);
  const [kolom, data, total, jumlah] = await Promise.all([
    kolomMatriks(user, t._id),
    barisMatriks(filter, { skip: (page - 1) * limit, limit }),
    SubkegiatanTahapan.countDocuments(filter),
    jumlahDaftar(filter),
  ]);
  return ser({ kolom, data, total, page, limit, totalKolom: jumlah.perSd, totalPagu: jumlah.pagu, totalAlokasi: jumlah.alokasi });
}

/* ---------- Pagu sumber dana ---------- */

export async function daftarPaguSumberDana(user: SessionUser, tahapanId: string) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const [sd, pagu, terpakai] = await Promise.all([
    SumberDana.find({ aktif: true }).sort({ kode: 1 }).lean(),
    PaguSumberDana.find({ tahapanId: t._id }).lean(),
    terpakaiPerSumberDana(t._id),
  ]);
  const paguPer = new Map(pagu.map((p) => [String(p.sumberDanaId), p]));
  return ser(
    sd.map((s) => ({
      sumberDanaId: String(s._id),
      kode: s.kode,
      nama: s.nama,
      khusus: s.khusus,
      nilai: paguPer.get(String(s._id))?.nilai ?? null,
      terpakai: terpakai.get(String(s._id))?.terpakai ?? 0,
      updatedAt: paguPer.get(String(s._id))?.updatedAt ?? null,
    })),
  );
}

/** PUT /api/tahapan/{id}/pagu-sumber-dana: bulkWrite upsert; nilai null menghapus pagu. */
export async function simpanPaguSumberDana(user: SessionUser, tahapanId: string, pagu: { sumberDanaId: string; nilai: number | null }[]) {
  pastikanBoleh(user, 'isi_pagu');
  const t = await pastikanTahapanTerbuka(tahapanId);
  await dalamTransaksi(async (session) => {
    const lama = await PaguSumberDana.find({ tahapanId: t._id }).session(session).lean();
    const lamaPer = new Map(lama.map((p) => [String(p.sumberDanaId), p.nilai]));
    const ops = pagu
      .filter((p) => (lamaPer.get(p.sumberDanaId) ?? null) !== p.nilai)
      .map((p) =>
        p.nilai === null
          ? { deleteOne: { filter: { tahapanId: t._id, sumberDanaId: oid(p.sumberDanaId) } } }
          : {
              updateOne: {
                filter: { tahapanId: t._id, sumberDanaId: oid(p.sumberDanaId) },
                update: { $set: { nilai: p.nilai, diubahOleh: oid(user.id) } },
                upsert: true,
              },
            },
      );
    if (!ops.length) return;
    await PaguSumberDana.bulkWrite(ops as never, { session });
    await catatAudit(
      {
        aksi: 'ubah_pagu_sumber_dana',
        koleksi: 'paguSumberDana',
        dokumenId: t._id,
        sebelum: Object.fromEntries(pagu.map((p) => [p.sumberDanaId, lamaPer.get(p.sumberDanaId) ?? null])),
        sesudah: Object.fromEntries(pagu.map((p) => [p.sumberDanaId, p.nilai])),
      },
      session,
    );
  });
  await segarkanNotifikasiSebagian(t._id, { sumberDanaIds: pagu.map((p) => p.sumberDanaId) });
  return daftarPaguSumberDana(user, tahapanId);
}

/* ---------- Dasbor ---------- */

export async function ringkasanDasbor(user: SessionUser, tahapanId: string) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const c = cakupanDb(user);
  // semua agregasi dijalankan bersamaan (satu putaran ke basis data, bukan berurutan)
  const [[agg], perSkpd, perSubUnit, rekap] = await Promise.all([
    SubkegiatanTahapan.aggregate<{
    jumlah: number;
    pagu: number;
    alokasi: number;
    tidakSeimbang: number;
    beda: number;
    hilang: number;
  }>([
    { $match: { tahapanId: t._id, ...c } },
    {
      $group: {
        _id: null,
        jumlah: { $sum: { $cond: [{ $eq: ['$status', 'aktif'] }, 1, 0] } },
        pagu: { $sum: { $cond: [{ $eq: ['$status', 'aktif'] }, '$pagu', 0] } },
        alokasi: { $sum: { $cond: [{ $eq: ['$status', 'aktif'] }, { $sum: '$alokasi.nilai' }, 0] } },
        tidakSeimbang: { $sum: { $cond: [{ $and: [{ $eq: ['$seimbang', false] }, { $eq: ['$status', 'aktif'] }] }, 1, 0] } },
        beda: { $sum: { $cond: ['$beda.ada', 1, 0] } },
        hilang: { $sum: { $cond: [{ $eq: ['$status', 'tidak_ada_di_impor'] }, 1, 0] } },
      },
    },
  ]),
    SubkegiatanTahapan.aggregate<{ _id: unknown; pagu: number; jumlah: number }>([
    { $match: { tahapanId: t._id, status: 'aktif', ...c } },
    { $group: { _id: '$skpdId', pagu: { $sum: '$pagu' }, jumlah: { $sum: 1 } } },
    { $sort: { pagu: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'skpd', localField: '_id', foreignField: '_id', as: 'skpd' } },
  ]),
    // rincian per sub unit: hanya dipakai dasbor akun SKPD (data perangkat daerahnya sendiri beserta sub unitnya)
    user.peran !== 'skpd'
      ? Promise.resolve([] as { _id: unknown; pagu: number; alokasi: number; jumlah: number; subUnit: { kode?: string; nama: string }[] }[])
      : SubkegiatanTahapan.aggregate<{ _id: unknown; pagu: number; alokasi: number; jumlah: number; subUnit: { kode?: string; nama: string }[] }>([
          { $match: { tahapanId: t._id, status: 'aktif', ...c } },
          { $group: { _id: '$subUnitId', pagu: { $sum: '$pagu' }, alokasi: { $sum: { $sum: '$alokasi.nilai' } }, jumlah: { $sum: 1 } } },
          { $lookup: { from: 'subUnit', localField: '_id', foreignField: '_id', as: 'subUnit' } },
          { $sort: { 'subUnit.kode': 1 } },
        ]),
    rekapSumberDana(user, tahapanId),
  ]);
  return ser({
    tahapan: t,
    angka: agg ?? { jumlah: 0, pagu: 0, alokasi: 0, tidakSeimbang: 0, beda: 0, hilang: 0 },
    perSkpd: perSkpd.map((p) => ({ nama: (p as unknown as { skpd: { nama: string }[] }).skpd[0]?.nama ?? '?', pagu: p.pagu, jumlah: p.jumlah })),
    perSubUnit: perSubUnit.map((p) => ({ nama: p.subUnit[0]?.nama ?? '?', kode: p.subUnit[0]?.kode ?? '', pagu: p.pagu, alokasi: p.alokasi, jumlah: p.jumlah })),
    rekap: rekap.baris,
    totalRekap: rekap.total,
  });
}

export { hashKomposisi, urutkan };
