import {
  Nomenklatur,
  Rekening,
  PaguSumberDana,
  Skpd,
  SubUnit,
  SubkegiatanTahapan,
  SumberDana,
  Tagging,
  oid,
  sambung,
  type NomenklaturDoc,
} from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { indukKode, normalisasiKode } from '../kode';
import { indukNomenklatur } from '../nomenklatur';
import { escapeRegex, pastikanId } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const galatDuplikat = (e: unknown, apa: string) => {
  if ((e as { code?: number }).code === 11000) throw new Galat('VALIDASI', `${apa} dengan kode tersebut sudah ada`);
  throw e;
};

/* ---------- SKPD & sub unit ---------- */

export async function daftarSkpd(user: SessionUser, opsi: { q?: string } = {}) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = user.peran === 'skpd' ? { _id: oid(user.skpdId) } : {};
  if (opsi.q) filter.$or = [{ kode: { $regex: escapeRegex(opsi.q) } }, { nama: { $regex: escapeRegex(opsi.q), $options: 'i' } }];
  const skpd = await Skpd.find(filter).sort({ kode: 1 }).lean();
  const sub = await SubUnit.find({ skpdId: { $in: skpd.map((s) => s._id) } }).sort({ kode: 1 }).lean();
  return ser(skpd.map((s) => ({ ...s, subUnit: sub.filter((u) => String(u.skpdId) === String(s._id)) })));
}

export async function buatSkpd(user: SessionUser, input: z.infer<typeof S.skpdInput>) {
  pastikanBoleh(user, 'kelola_skpd');
  await sambung();
  return ser((await Skpd.create(input).catch((e) => galatDuplikat(e, 'SKPD')))!.toObject());
}

export async function ubahSkpd(user: SessionUser, id: string, input: z.infer<typeof S.skpdUbah>) {
  pastikanBoleh(user, 'kelola_skpd');
  await sambung();
  const d = await Skpd.findOneAndUpdate({ _id: oid(pastikanId(id, 'SKPD')) }, { $set: input }, { new: true })
    .lean()
    .catch((e) => galatDuplikat(e, 'SKPD'));
  if (!d) throw tidakDitemukan('SKPD');
  return ser(d);
}

export async function buatSubUnit(user: SessionUser, input: z.infer<typeof S.subUnitInput>) {
  pastikanBoleh(user, 'kelola_skpd');
  await sambung();
  if (!(await Skpd.exists({ _id: oid(input.skpdId) }))) throw tidakDitemukan('SKPD');
  return ser((await SubUnit.create({ ...input, skpdId: oid(input.skpdId) }).catch((e) => galatDuplikat(e, 'Sub unit')))!.toObject());
}

export async function ubahSubUnit(user: SessionUser, id: string, input: z.infer<typeof S.skpdUbah>) {
  pastikanBoleh(user, 'kelola_skpd');
  await sambung();
  const d = await SubUnit.findOneAndUpdate({ _id: oid(pastikanId(id, 'Sub unit')) }, { $set: input }, { new: true }).lean();
  if (!d) throw tidakDitemukan('Sub unit');
  return ser(d);
}

/* ---------- Sumber dana ---------- */

export async function daftarSumberDana(user: SessionUser, opsi: { q?: string; khusus?: boolean } = {}) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (opsi.khusus !== undefined) filter.khusus = opsi.khusus;
  if (opsi.q) filter.$or = [{ kode: { $regex: `^${escapeRegex(opsi.q)}` } }, { nama: { $regex: escapeRegex(opsi.q), $options: 'i' } }];
  const data = await SumberDana.find(filter).lean();
  data.sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
  return ser(data);
}

export async function detailSumberDana(user: SessionUser, kodeAtauId: string, tahun?: number) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const sd = /^[0-9a-f]{24}$/i.test(kodeAtauId)
    ? await SumberDana.findById(kodeAtauId).lean()
    : await SumberDana.findOne({ kode: kodeAtauId }).lean();
  if (!sd) throw tidakDitemukan('Sumber dana');
  const tagging = tahun ? await Tagging.find({ tahun, sumberDanaId: sd._id }).sort({ kodeSubkegiatan: 1 }).lean() : [];
  const kode = [...new Set(tagging.map((t) => t.kodeSubkegiatan))];
  const nama = await Nomenklatur.find({ kode: { $in: kode }, aktif: true }).select('kode nama').lean();
  const namaPer = Object.fromEntries(nama.map((n) => [n.kode, n.nama]));
  return ser({ ...sd, tagging: tagging.map((t) => ({ ...t, namaSubkegiatan: namaPer[t.kodeSubkegiatan] })) });
}

export async function buatSumberDana(user: SessionUser, input: z.infer<typeof S.sumberDanaInput>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await SumberDana.create({ ...input, indukKode: indukKode(input.kode) }).catch((e) => galatDuplikat(e, 'Sumber dana'));
  return ser(d!.toObject());
}

export async function ubahSumberDana(user: SessionUser, id: string, input: z.infer<typeof S.sumberDanaUbah>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await SumberDana.findOneAndUpdate({ _id: oid(pastikanId(id, 'Sumber dana')) }, { $set: input }, { new: true }).lean();
  if (!d) throw tidakDitemukan('Sumber dana');
  return ser(d);
}

/** Sumber dana yang sudah dipakai alokasi atau pagu tidak bisa dihapus; nonaktifkan saja. */
export async function hapusSumberDana(user: SessionUser, id: string) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const _id = oid(pastikanId(id, 'Sumber dana'));
  const dipakai =
    (await SubkegiatanTahapan.exists({ 'alokasi.sumberDanaId': _id })) ||
    (await SubkegiatanTahapan.exists({ 'alokasiSipd.sumberDanaId': _id })) ||
    (await PaguSumberDana.exists({ sumberDanaId: _id })) ||
    (await Tagging.exists({ sumberDanaId: _id }));
  if (dipakai) throw new Galat('VALIDASI', 'Sumber dana sudah dipakai; nonaktifkan saja, jangan dihapus');
  const r = await SumberDana.deleteOne({ _id });
  if (!r.deletedCount) throw tidakDitemukan('Sumber dana');
  return { ok: true };
}

/* ---------- Nomenklatur ---------- */

export async function daftarNomenklatur(user: SessionUser, opsi: { induk?: string; q?: string; versi?: string }) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = opsi.versi ? { versi: opsi.versi } : { aktif: true };
  if (opsi.q) {
    const q = escapeRegex(opsi.q.trim());
    filter.$or = [{ kode: { $regex: `^${q}` } }, { nama: { $regex: q, $options: 'i' } }];
  } else if (opsi.induk) filter.indukKode = opsi.induk;
  else filter.jenis = 'urusan';
  const data = await Nomenklatur.find(filter).limit(opsi.q ? 100 : 1000).lean<NomenklaturDoc[]>();
  data.sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
  const anak = await Nomenklatur.aggregate<{ _id: string; n: number }>([
    { $match: { indukKode: { $in: data.map((d) => d.kode) }, aktif: true } },
    { $group: { _id: '$indukKode', n: { $sum: 1 } } },
  ]);
  const anakPer = new Map(anak.map((a) => [a._id, a.n]));
  const versi = await Nomenklatur.distinct('versi', { aktif: true });
  return ser({ versi, data: data.map((d) => ({ ...d, jumlahAnak: anakPer.get(d.kode) ?? 0 })) });
}

export async function detailNomenklatur(user: SessionUser, kode: string, tahun?: number) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const k = normalisasiKode(kode);
  const d = await Nomenklatur.findOne({ kode: k, aktif: true }).lean();
  if (!d) throw tidakDitemukan('Nomenklatur');
  const leluhur: NomenklaturDoc[] = [];
  let induk = d.indukKode;
  while (induk) {
    const p = await Nomenklatur.findOne({ kode: induk, aktif: true }).lean<NomenklaturDoc>();
    if (!p) break;
    leluhur.unshift(p);
    induk = p.indukKode;
  }
  const tagging = tahun ? await Tagging.find({ tahun, kodeSubkegiatan: k }).populate('sumberDanaId', 'kode nama').lean() : [];
  return ser({ ...d, leluhur, tagging });
}

/* ---------- Tagging (satu koleksi, dua tampilan) ---------- */

export async function daftarTagging(user: SessionUser, f: { tahun: number; sumberDanaId?: string; kodeSubkegiatan?: string; page?: number; limit?: number }) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = { tahun: f.tahun };
  if (f.sumberDanaId) filter.sumberDanaId = oid(pastikanId(f.sumberDanaId));
  if (f.kodeSubkegiatan) filter.kodeSubkegiatan = normalisasiKode(f.kodeSubkegiatan);
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total] = await Promise.all([
    Tagging.find(filter).sort({ kodeSubkegiatan: 1 }).skip((page - 1) * limit).limit(limit).populate('sumberDanaId', 'kode nama').lean(),
    Tagging.countDocuments(filter),
  ]);
  return ser({ data, total, page, limit });
}

export async function buatTagging(user: SessionUser, input: z.infer<typeof S.taggingInput>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  if (!(await SumberDana.exists({ _id: oid(input.sumberDanaId) }))) throw tidakDitemukan('Sumber dana');
  const d = await Tagging.create({
    ...input,
    kodeSubkegiatan: normalisasiKode(input.kodeSubkegiatan),
    sumberDanaId: oid(input.sumberDanaId),
    diubahOleh: oid(user.id),
  }).catch((e) => {
    if ((e as { code?: number }).code === 11000) throw new Galat('VALIDASI', 'Tagging yang sama sudah ada');
    throw e;
  });
  return ser(d.toObject());
}

export async function ubahTagging(user: SessionUser, id: string, input: z.infer<typeof S.taggingUbah>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await Tagging.findOneAndUpdate({ _id: oid(pastikanId(id, 'Tagging')) }, { $set: { ...input, diubahOleh: oid(user.id) } }, { new: true }).lean();
  if (!d) throw tidakDitemukan('Tagging');
  return ser(d);
}

export async function hapusTagging(user: SessionUser, id: string) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await Tagging.findOneAndDelete({ _id: oid(pastikanId(id, 'Tagging')) }).lean();
  if (!d) throw tidakDitemukan('Tagging');
  const { catatAudit } = await import('@danboy/db');
  await catatAudit({ aksi: 'hapus', koleksi: 'tagging', dokumenId: d._id, sebelum: ser(d) as Record<string, unknown> });
  return { ok: true };
}

/* ---------- Nomenklatur: tambah/ubah manual (Super Admin) ---------- */

/** Versi aktif tempat entri manual ditambahkan: versi impor terbaru yang aktif, atau "manual" bila belum ada impor. */
async function versiAktif(): Promise<string> {
  const terbaru = await Nomenklatur.findOne({ aktif: true }).sort({ updatedAt: -1 }).select('versi').lean();
  return terbaru?.versi ?? 'manual';
}

export async function buatNomenklatur(user: SessionUser, input: z.infer<typeof S.nomenklaturInput>) {
  pastikanBoleh(user, 'kelola_nomenklatur');
  await sambung();
  const kode = normalisasiKode(input.kode);
  if (await Nomenklatur.exists({ kode, aktif: true })) throw new Galat('VALIDASI', `Kode ${kode} sudah ada`, { kode: 'Kode sudah ada' });
  const induk = indukNomenklatur(input.jenis, kode);
  if (induk && !(await Nomenklatur.exists({ kode: induk, aktif: true })))
    throw new Galat('VALIDASI', `Induk ${induk} belum ada; tambahkan induknya lebih dulu`, { kode: `Induk ${induk} belum ada` });
  const versi = await versiAktif();
  const d = await Nomenklatur.findOneAndUpdate(
    { versi, kode },
    { $set: { jenis: input.jenis, nama: input.nama, indukKode: induk ?? null, aktif: true } },
    { upsert: true, new: true },
  ).lean();
  return ser(d);
}

export async function ubahNomenklatur(user: SessionUser, id: string, input: z.infer<typeof S.nomenklaturUbah>) {
  pastikanBoleh(user, 'kelola_nomenklatur');
  await sambung();
  const d = await Nomenklatur.findOneAndUpdate({ _id: oid(pastikanId(id, 'Nomenklatur')) }, { $set: input }, { new: true }).lean();
  if (!d) throw tidakDitemukan('Nomenklatur');
  return ser(d);
}

/* ---------- Rekening (Admin Keuangan) ---------- */

export async function daftarRekening(user: SessionUser, f: { q?: string; page?: number; limit?: number } = {}) {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (f.q) {
    const q = escapeRegex(f.q.trim());
    filter.$or = [{ kode: { $regex: `^${q}` } }, { nama: { $regex: q, $options: 'i' } }];
  }
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total] = await Promise.all([
    Rekening.find(filter).collation({ locale: 'id', numericOrdering: true }).sort({ kode: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Rekening.countDocuments(filter),
  ]);
  return ser({ data, total, page, limit });
}

export async function buatRekening(user: SessionUser, input: z.infer<typeof S.rekeningInput>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await Rekening.create(input).catch((e) => galatDuplikat(e, 'Rekening'));
  return ser(d!.toObject());
}

export async function ubahRekening(user: SessionUser, id: string, input: z.infer<typeof S.rekeningUbah>) {
  pastikanBoleh(user, 'kelola_sumber_dana');
  await sambung();
  const d = await Rekening.findOneAndUpdate({ _id: oid(pastikanId(id, 'Rekening')) }, { $set: input }, { new: true }).lean();
  if (!d) throw tidakDitemukan('Rekening');
  return ser(d);
}
