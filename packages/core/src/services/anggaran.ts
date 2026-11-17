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
import type { AlokasiInput, FilterSubkegiatan } from '@danboy/schema';
import { dalamCakupan, pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { hashKomposisi, ikutSipd as hitungIkutSipd, terapkanEditAdmin, urutkan } from '../pembanding';
import { statusSumberDana, type StatusSumberDana } from '../rekap';
import { kandidatKodeNomenklatur } from '../kode';
import { segarkanNotifikasi } from './notifikasi';
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
  const [global, pagu, sdList] = await Promise.all([
    terpakaiPerSumberDana(t._id),
    PaguSumberDana.find({ tahapanId: t._id }).lean(),
    SumberDana.find().lean<SumberDanaDoc[]>(),
  ]);
  const milikSaya = user.peran === 'skpd' ? await terpakaiPerSumberDana(t._id, cakupanDb(user)) : null;
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
 * Id subkegiatan yang "beda dengan tagging" (R6): ada di daftar tagging tahun itu, tetapi ada sumber dana
 * tagging-nya yang tidak dipakai (alokasi 0 atau tidak ada). Dihitung saat diminta, tidak disimpan.
 */
async function idBedaTagging(user: SessionUser, t: { _id: ReturnType<typeof oid>; tahun: number }) {
  const [tagging, docs] = await Promise.all([
    Tagging.find({ tahun: t.tahun }).select('sumberDanaId kodeSubkegiatan').lean(),
    SubkegiatanTahapan.find({ tahapanId: t._id, ...cakupanDb(user) }).select('kodeSubkegiatan alokasi').lean<SubkegiatanTahapanDoc[]>(),
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
      return kandidatKodeNomenklatur(d.kodeSubkegiatan).some((k) => [...(sdPerKode.get(k) ?? [])].some((sid) => !dipakai.has(sid)));
    })
    .map((d) => d._id);
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
    SubkegiatanTahapan.find(filter)
      .select('-rincian')
      .sort({ kodeSubkegiatan: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('skpdId', 'kode nama')
      .populate('subUnitId', 'kode nama')
      .populate('alokasi.sumberDanaId', 'kode nama khusus')
      .lean(),
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
  const t = await muatTahapan(d.tahapanId);
  const sdIds = [...new Set([...d.alokasi.map((a) => String(a.sumberDanaId)), ...(d.alokasiSipd ?? []).map((a) => String(a.sumberDanaId))])];
  const [skpd, subUnit, sdList, tagging, nomenklatur, riwayat, riwayatImpor] = await Promise.all([
    Skpd.findById(d.skpdId).lean(),
    SubUnit.findById(d.subUnitId).lean(),
    SumberDana.find({ _id: { $in: sdIds.map(oid) } }).lean(),
    Tagging.find({ tahun: t.tahun, kodeSubkegiatan: { $in: kandidatKodeNomenklatur(d.kodeSubkegiatan) } }).populate('sumberDanaId', 'kode nama').lean(),
    Nomenklatur.find({ kode: { $in: kandidatKodeNomenklatur(d.kodeSubkegiatan) }, aktif: true })
      .lean()
      .then((xs) => xs.sort((a, b) => (a.kode === d.kodeSubkegiatan ? -1 : b.kode === d.kodeSubkegiatan ? 1 : 0))[0] ?? null),
    LogAudit.find({ koleksi: 'subkegiatanTahapan', dokumenId: d._id }).sort({ waktu: -1 }).limit(30).populate('userId', 'nama username').lean(),
    HasilBanding.find({ kunci: `${d.subUnitId}|${d.kodeSubkegiatan}` })
      .select('batchId aturan sebelum sesudah')
      .sort({ _id: -1 })
      .limit(10)
      .populate({ path: 'batchId', select: 'namaFile status diterapkanPada tahapanId', match: { tahapanId: d.tahapanId, status: 'diterapkan' } })
      .lean(),
  ]);
  const sdPer = Object.fromEntries(sdList.map((s) => [String(s._id), s]));
  const taggingSd = new Set(tagging.map((x) => String((x.sumberDanaId as unknown as { _id: unknown })?._id ?? x.sumberDanaId)));
  // R6: tertagging untuk sumber dana khusus tertentu, tetapi didanai sumber lain (dihitung saat tampil)
  const r6 = tagging
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

/** Sisa pagu sumber dana yang tersentuh, agar tampilan langsung memperbarui angka. */
async function ringkasanSisa(tahapanId: ReturnType<typeof oid>, sdIds: string[], session?: ClientSession) {
  const terpakai = await terpakaiPerSumberDana(tahapanId, {}, session);
  const pagu = await PaguSumberDana.find({ tahapanId, sumberDanaId: { $in: sdIds.map(oid) } }).session(session ?? null).lean();
  const sd = await SumberDana.find({ _id: { $in: sdIds.map(oid) } }).session(session ?? null).lean();
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
  await segarkanNotifikasi(d.tahapanId);
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
  await segarkanNotifikasi(d.tahapanId);
  return { ok: true };
}

/** "Ikut SIPD untuk semua": semua dokumen beda.ada = true dalam filter aktif, satu transaksi. */
export async function ikutSipdSemua(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'ubah_alokasi');
  const t = await pastikanTahapanTerbuka(tahapanId);
  const filter = { ...filterDaftar(user, t._id, { ...f, status: undefined }), 'beda.ada': true };
  const jumlah = await dalamTransaksi(async (session) => {
    const docs = await SubkegiatanTahapan.find(filter).session(session).lean<SubkegiatanTahapanDoc[]>();
    for (const d of docs) {
      const r = hitungIkutSipd({ pagu: d.pagu, alokasiSipd: (d.alokasiSipd ?? []).map((a) => ({ sumberDanaId: String(a.sumberDanaId), nilai: a.nilai })) });
      await SubkegiatanTahapan.updateOne(
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
  const [data, total] = await Promise.all([
    SubkegiatanTahapan.find(filter)
      .select('-rincian')
      .sort({ kodeSubkegiatan: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('skpdId', 'kode nama')
      .populate('subUnitId', 'kode nama')
      .lean<SubkegiatanTahapanDoc[]>(),
    SubkegiatanTahapan.countDocuments(filter),
  ]);
  const sdIds = new Set<string>();
  for (const d of data) {
    d.alokasi.forEach((a) => sdIds.add(String(a.sumberDanaId)));
    (d.alokasiSipd ?? []).forEach((a) => sdIds.add(String(a.sumberDanaId)));
  }
  const sd = await SumberDana.find({ _id: { $in: [...sdIds].map(oid) } }).select('kode nama').lean();
  return ser({ data, total, page, limit, sumberDana: Object.fromEntries(sd.map((s) => [String(s._id), s])) });
}

/** Matriks subkegiatan × sumber dana. Kolom = sumber dana yang dipakai dalam cakupan. */
export async function matriks(user: SessionUser, tahapanId: string, f: Partial<FilterSubkegiatan>) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const filter = await filterDaftarLengkap(user, t, f);
  const kolomIds = await SubkegiatanTahapan.distinct('alokasi.sumberDanaId', { tahapanId: t._id, ...cakupanDb(user) });
  const kolom = await SumberDana.find({ _id: { $in: kolomIds } }).select('kode nama khusus').sort({ kode: 1 }).lean();
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 100, 200);
  const [data, total, jumlah] = await Promise.all([
    SubkegiatanTahapan.find(filter)
      .select('kodeSubkegiatan namaSubkegiatan pagu alokasi seimbang skpdId subUnitId beda status')
      .sort({ kodeSubkegiatan: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('skpdId', 'kode nama')
      .populate('subUnitId', 'kode nama')
      .lean(),
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
  await segarkanNotifikasi(t._id);
  return daftarPaguSumberDana(user, tahapanId);
}

/* ---------- Dasbor ---------- */

export async function ringkasanDasbor(user: SessionUser, tahapanId: string) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const c = cakupanDb(user);
  const [agg] = await SubkegiatanTahapan.aggregate<{
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
  ]);
  const perSkpd = await SubkegiatanTahapan.aggregate<{ _id: unknown; pagu: number; jumlah: number }>([
    { $match: { tahapanId: t._id, status: 'aktif', ...c } },
    { $group: { _id: '$skpdId', pagu: { $sum: '$pagu' }, jumlah: { $sum: 1 } } },
    { $sort: { pagu: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'skpd', localField: '_id', foreignField: '_id', as: 'skpd' } },
  ]);
  const rekap = await rekapSumberDana(user, tahapanId);
  return ser({
    tahapan: t,
    angka: agg ?? { jumlah: 0, pagu: 0, alokasi: 0, tidakSeimbang: 0, beda: 0, hilang: 0 },
    perSkpd: perSkpd.map((p) => ({ nama: (p as unknown as { skpd: { nama: string }[] }).skpd[0]?.nama ?? '?', pagu: p.pagu, jumlah: p.jumlah })),
    rekap: rekap.baris,
    totalRekap: rekap.total,
  });
}

export { hashKomposisi, urutkan };
