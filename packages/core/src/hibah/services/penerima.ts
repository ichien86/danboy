import {
  catatAudit, HibahBerkas, HibahJenisPenerima, HibahPenerima, HibahRiwayat, HibahUsulan, oid, sambung, WilayahDesa, WilayahKecamatan,
  type HibahJenisPenerimaDoc, type HibahPenerimaDoc, type HibahRiwayatDoc,
} from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { escapeRegex } from '../../services/umum';
import { jaroWinkler, AMBANG_MIRIP, normalisasiNama, validasiIdentitas } from '../aturan';
import { bungkusIdentitas, dekripsi, sidik } from '../rahasia';
import { BATAS_BERKAS, terimaBerkas, tipeBerkas } from './berkas';
import { cekJadwal, galatBerubah, petaNamaPd, pastikanIdHibah, ser, syaratVersi, tahunAktif } from './umum';

type Berkas = { nama: string; isi: Buffer } | null | undefined;
const TANPA_RAHASIA = { 'identitas.sandi': 0, 'identitas.sidik': 0, 'kk.sandi': 0, 'kk.sidik': 0 };

async function jenisPenerima(kode: string) {
  const j = await HibahJenisPenerima.findOne({ kode, aktif: true }).lean<HibahJenisPenerimaDoc>();
  if (!j) throw new Galat('VALIDASI', 'Jenis penerima tidak dikenal', { jenisPenerimaKode: 'Tidak dikenal' });
  return j;
}

async function cekWilayah(kecamatanKode?: string, desaKode?: string) {
  if (kecamatanKode && !(await WilayahKecamatan.exists({ kode: kecamatanKode }))) throw new Galat('VALIDASI', 'Kecamatan tidak dikenal', { kecamatanKode: 'Tidak dikenal' });
  if (desaKode) {
    const d = await WilayahDesa.findOne({ kode: desaKode }).lean();
    if (!d) throw new Galat('VALIDASI', 'Desa/kelurahan tidak dikenal', { desaKode: 'Tidak dikenal' });
    if (kecamatanKode && d.kecamatanKode !== kecamatanKode) throw new Galat('VALIDASI', 'Desa/kelurahan tidak berada di kecamatan itu', { desaKode: 'Tidak sesuai kecamatan' });
  }
}

/** Filter kartu yang terlihat: Operator PD hanya kartu buatan PD-nya atau yang punya usulan di PD-nya. */
async function filterTerlihat(user: SessionUser): Promise<Record<string, unknown>> {
  if (peranHibah(user) !== 'operator_pd') return {};
  const ids = await HibahUsulan.distinct('penerimaId', { skpdId: oid(user.skpdId) });
  return { $or: [{ skpdPembuatId: oid(user.skpdId) }, { _id: { $in: ids } }] };
}

async function muatPenerima(user: SessionUser, id: string) {
  const d = await HibahPenerima.findOne({ _id: oid(pastikanIdHibah(id, 'Penerima')), ...(await filterTerlihat(user)) }).lean<HibahPenerimaDoc>();
  if (!d) throw tidakDitemukan('Penerima');
  return d;
}

export async function daftarPenerima(user: SessionUser, f: { q?: string; page?: number; limit?: number } = {}) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const dasar = await filterTerlihat(user);
  let filter: Record<string, unknown> = dasar;
  if (f.q?.trim()) {
    const q = f.q.trim();
    const cari: Record<string, unknown>[] = [{ namaNormal: { $regex: escapeRegex(normalisasiNama(q)), $options: 'i' } }];
    // nomor identitas lengkap dicari lewat sidik, tanpa menyimpan atau membandingkan nilai terbuka
    if (/^[\d\s.-]{8,}$/.test(q)) for (const j of ['nik', 'badan_hukum', 'lainnya']) cari.push({ 'identitas.sidik': sidik(j, q) });
    filter = { $and: [dasar, { $or: cari }] };
  }
  const page = f.page ?? 1;
  const limit = f.limit ?? 50;
  const [data, total] = await Promise.all([
    HibahPenerima.find(filter, TANPA_RAHASIA).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean<HibahPenerimaDoc[]>(),
    HibahPenerima.countDocuments(filter),
  ]);
  const jumlah = await HibahUsulan.aggregate<{ _id: unknown; n: number }>([{ $match: { penerimaId: { $in: data.map((d) => d._id) } } }, { $group: { _id: '$penerimaId', n: { $sum: 1 } } }]);
  const per = new Map(jumlah.map((j) => [String(j._id), j.n]));
  return ser({ data: data.map((d) => ({ ...d, jumlahUsulan: per.get(String(d._id)) ?? 0 })), total, page, limit });
}

/** FR-14: identitas sama = duplikat (BR-03); nama mirip di desa yang sama = tawarkan kartu yang ada. */
export async function cekDuplikatPenerima(user: SessionUser, input: z.infer<typeof S.cekPenerimaInput>) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  let sama: unknown = null;
  if (input.identitas?.trim() && input.jenisPenerimaKode) {
    const j = await jenisPenerima(input.jenisPenerimaKode);
    sama = await HibahPenerima.findOne({ 'identitas.sidik': sidik(j.identitas, input.identitas) }, { nama: 1, 'identitas.samaran': 1, desaKode: 1 }).lean();
  }
  let mirip: unknown[] = [];
  if (input.nama?.trim()) {
    const n = normalisasiNama(input.nama);
    const calon = await HibahPenerima.find(input.desaKode ? { desaKode: input.desaKode } : { namaNormal: { $regex: `^${escapeRegex(n.slice(0, 3))}` } }, {
      nama: 1, namaNormal: 1, 'identitas.samaran': 1, desaKode: 1, jenisPenerimaKode: 1,
    })
      .limit(500)
      .lean<HibahPenerimaDoc[]>();
    mirip = calon.filter((c) => jaroWinkler(n, c.namaNormal) >= AMBANG_MIRIP).slice(0, 10);
  }
  return ser({ sama, mirip });
}

/** Validasi berkas identitas sebelum kartu disimpan, agar kartu tidak pernah tersimpan tanpa KTP/KK (BR-04). */
function cekBerkasIdentitas(j: HibahJenisPenerimaDoc, b: { ktp?: Berkas; kk?: Berkas }, adaSebelumnya = { ktp: false, kk: false }) {
  const g: Record<string, string> = {};
  if ((j.identitas === 'nik' || j.identitas === 'nik_kk') && !b.ktp && !adaSebelumnya.ktp) g.ktp = 'Unggahan KTP wajib';
  if (j.identitas === 'nik_kk' && !b.kk && !adaSebelumnya.kk) g.kk = 'Unggahan KK wajib';
  for (const [k, f] of Object.entries(b)) {
    if (!f) continue;
    if (f.isi.length > BATAS_BERKAS) g[k] = 'Berkas maksimal 5 MB';
    else if (!tipeBerkas(f.isi)) g[k] = 'Berkas harus PDF, JPG, atau PNG';
  }
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
}

export async function buatPenerima(user: SessionUser, input: z.infer<typeof S.penerimaInput>, berkas: { ktp?: Berkas; kk?: Berkas } = {}) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const t = await tahunAktif();
  await cekJadwal(t.tahun, 'input', user.skpdId);
  const j = await jenisPenerima(input.jenisPenerimaKode);
  validasiIdentitas(j.identitas, input.identitas, input.nomorKk);
  cekBerkasIdentitas(j, berkas);
  await cekWilayah(input.kecamatanKode, input.desaKode);
  const identitas = input.identitas?.trim() ? bungkusIdentitas(j.identitas, input.identitas) : null;
  if (identitas) {
    const ada = await HibahPenerima.findOne({ 'identitas.sidik': identitas.sidik }, { nama: 1 }).lean();
    if (ada) throw new Galat('DUPLIKAT', `Identitas ini sudah dipakai kartu "${ada.nama}"`, { penerimaId: String(ada._id), identitas: 'Sudah terdaftar' });
  }
  const kk = j.identitas === 'nik_kk' && input.nomorKk ? (({ sandi, sidik: s, samaran }) => ({ sandi, sidik: s, samaran }))(bungkusIdentitas('kk', input.nomorKk)) : null;
  let d;
  try {
    d = await HibahPenerima.create({
      jenisPenerimaKode: j.kode,
      nama: input.nama,
      namaNormal: normalisasiNama(input.nama),
      identitas,
      kk,
      alamat: input.alamat,
      kecamatanKode: input.kecamatanKode,
      desaKode: input.desaKode,
      kontak: input.kontak,
      penanggungJawab: input.penanggungJawab,
      skpdPembuatId: oid(user.skpdId),
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new Galat('DUPLIKAT', 'Identitas ini sudah terdaftar', { identitas: 'Sudah terdaftar' });
    throw e;
  }
  for (const [jenisDokumen, f] of Object.entries(berkas)) {
    if (f) await terimaBerkas(user, { pemilikJenis: 'penerima', pemilikId: String(d._id), jenisDokumen, nama: f.nama, isi: f.isi });
  }
  return ser(await HibahPenerima.findById(d._id, TANPA_RAHASIA).lean());
}

export async function ubahPenerima(user: SessionUser, id: string, input: z.infer<typeof S.penerimaUbah>, berkas: { ktp?: Berkas; kk?: Berkas } = {}) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const lama = await muatPenerima(user, id);
  if (String(lama.skpdPembuatId) !== user.skpdId) throw new Galat('TIDAK_BERHAK', 'Kartu hanya bisa diubah oleh PD yang membuatnya');
  const j = await jenisPenerima(input.jenisPenerimaKode ?? lama.jenisPenerimaKode);
  const set: Record<string, unknown> = {};
  for (const k of ['nama', 'alamat', 'kecamatanKode', 'desaKode', 'kontak', 'penanggungJawab'] as const) if (input[k] !== undefined) set[k] = input[k];
  if (input.jenisPenerimaKode) set.jenisPenerimaKode = j.kode;
  if (set.nama) set.namaNormal = normalisasiNama(String(set.nama));
  if (input.identitas !== undefined && input.identitas !== null && input.identitas.trim()) {
    validasiIdentitas(j.identitas, input.identitas, input.nomorKk ?? (lama.kk ? dekripsi(lama.kk.sandi) : null));
    set.identitas = bungkusIdentitas(j.identitas, input.identitas);
    const ada = await HibahPenerima.findOne({ 'identitas.sidik': (set.identitas as { sidik: string }).sidik, _id: { $ne: lama._id } }, { nama: 1 }).lean();
    if (ada) throw new Galat('DUPLIKAT', `Identitas ini sudah dipakai kartu "${ada.nama}"`, { penerimaId: String(ada._id) });
  }
  if (input.nomorKk?.trim()) set.kk = (({ sandi, sidik: s, samaran }) => ({ sandi, sidik: s, samaran }))(bungkusIdentitas('kk', input.nomorKk));
  const punya = async (jd: string) => !!(await HibahBerkas.exists({ 'pemilik.jenis': 'penerima', 'pemilik.id': lama._id, jenisDokumen: jd, aktif: true }));
  cekBerkasIdentitas(j, berkas, { ktp: await punya('ktp'), kk: await punya('kk') });
  await cekWilayah((set.kecamatanKode as string) ?? lama.kecamatanKode, (set.desaKode as string) ?? lama.desaKode);
  const d = await HibahPenerima.findOneAndUpdate({ _id: lama._id, updatedAt: syaratVersi(input.updatedAt) }, { $set: set }, { new: true, projection: TANPA_RAHASIA }).lean();
  if (!d) throw galatBerubah();
  for (const [jenisDokumen, f] of Object.entries(berkas)) {
    if (f) await terimaBerkas(user, { pemilikJenis: 'penerima', pemilikId: String(lama._id), jenisDokumen, nama: f.nama, isi: f.isi });
  }
  return ser(d);
}

/** FR-11: cocokkan penerima dengan riwayat impor (sama lewat sidik; kemungkinan sama lewat nama + desa). */
export async function cocokkanRiwayat(p: Pick<HibahPenerimaDoc, 'identitas' | 'namaNormal' | 'desaKode' | 'kecamatanKode'>, tahunSebelum?: number) {
  const filterTahun = tahunSebelum ? { tahun: { $lt: tahunSebelum } } : {};
  const hasil: (HibahRiwayatDoc & { tingkat: 'sama' | 'kemungkinan' })[] = [];
  if (p.identitas?.sidik) {
    for (const r of await HibahRiwayat.find({ sidikIdentitas: p.identitas.sidik, ...filterTahun }).lean<HibahRiwayatDoc[]>()) hasil.push({ ...r, tingkat: 'sama' });
  }
  const wilayah = p.desaKode ? { desaKode: p.desaKode } : p.kecamatanKode ? { kecamatanKode: p.kecamatanKode } : null;
  if (wilayah) {
    const calon = await HibahRiwayat.find({ ...wilayah, ...filterTahun }).limit(2000).lean<HibahRiwayatDoc[]>();
    for (const r of calon) {
      if (hasil.some((h) => String(h._id) === String(r._id))) continue;
      // identitas berbeda di kedua sisi = orang/badan berbeda
      if (p.identitas?.sidik && r.sidikIdentitas && r.sidikIdentitas !== p.identitas.sidik) continue;
      if (jaroWinkler(p.namaNormal, r.namaNormal) >= AMBANG_MIRIP) hasil.push({ ...r, tingkat: 'kemungkinan' });
    }
  }
  return hasil.sort((a, b) => b.tahun - a.tahun);
}

export async function detailPenerima(user: SessionUser, id: string, opsi: { bukaIdentitas?: boolean } = {}) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const p = await muatPenerima(user, id);
  let identitasLengkap: string | null = null;
  let kkLengkap: string | null = null;
  if (opsi.bukaIdentitas) {
    if (!bolehHibah(user, 'hibah_buka_ktp')) throw new Galat('TIDAK_BERHAK', 'Anda tidak berhak membuka identitas lengkap');
    identitasLengkap = p.identitas?.sandi ? dekripsi(p.identitas.sandi) : null;
    kkLengkap = p.kk?.sandi ? dekripsi(p.kk.sandi) : null;
    await catatAudit({ aksi: 'buka_identitas', koleksi: 'hibah_penerima', dokumenId: p._id });
  }
  const [usulan, riwayat] = await Promise.all([
    HibahUsulan.find({ penerimaId: p._id }, { nomor: 1, tahun: 1, skpdId: 1, status: 1, nilaiUsulan: 1, nilaiRekomendasi: 1, nilaiDisetujui: 1, bentuk: 1 })
      .sort({ tahun: -1, createdAt: -1 })
      .lean(),
    cocokkanRiwayat(p),
  ]);
  const nama = await petaNamaPd(usulan.map((u) => u.skpdId));
  const { identitas, kk, ...rest } = p;
  return ser({
    ...rest,
    identitas: identitas ? { jenis: identitas.jenis, samaran: identitas.samaran } : null,
    kk: kk ? { samaran: kk.samaran } : null,
    identitasLengkap,
    kkLengkap,
    bisaDiubah: peranHibah(user) === 'operator_pd' && String(p.skpdPembuatId) === user.skpdId,
    usulan: usulan.map((u) => ({ ...u, namaPd: nama.get(String(u.skpdId)) ?? '' })),
    riwayat: riwayat.map(({ sidikIdentitas: _s, ...r }) => r),
  });
}
