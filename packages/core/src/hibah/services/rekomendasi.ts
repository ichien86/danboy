import {
  dalamTransaksi, HibahBerkas, HibahJenisPenerima, HibahPenerima, HibahRekomendasi, HibahUsulan, oid, sambung, Skpd, WilayahDesa, WilayahKecamatan,
  type HibahRekomendasiDoc, type HibahUsulanDoc,
} from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { isiTemplat } from '@danboy/cetak';
import { Galat, tidakDitemukan } from '../../galat';
import { pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { transisi } from '../aturan';
import { terimaBerkas } from './berkas';
import { ambilTemplat } from './master';
import { cekJadwalPd } from './usulan';
import { cakupanDbHibah, galatBerubah, pastikanIdHibah, ser, syaratVersi, tahunAktif } from './umum';

const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const rpTeks = (n: number | null | undefined) => (n === null || n === undefined ? '' : fmt.format(n));
export const tanggalPanjang = (d: Date | string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

async function muatRekomendasi(user: SessionUser, id: string) {
  const r = await HibahRekomendasi.findOne({ _id: oid(pastikanIdHibah(id, 'Rekomendasi')), ...cakupanDbHibah(user) }).lean<HibahRekomendasiDoc>();
  if (!r) throw tidakDitemukan('Rekomendasi');
  return r;
}

function pastikanOperatorPemilik(user: SessionUser, r: HibahRekomendasiDoc) {
  if (peranHibah(user) !== 'operator_pd' || String(r.skpdId) !== user.skpdId) throw new Galat('TIDAK_BERHAK', 'Hanya Operator PD pemilik dokumen');
}

const catat = (status: string, user: SessionUser, catatan = '') => ({ status, waktu: new Date(), userId: oid(user.id), catatan });

/** BR-08: semua usulan Layak, satu PD, satu tahun, dan belum ada di rekomendasi lain. */
async function ambilUsulanUntukRekomendasi(user: SessionUser, ids: string[], tahun: number, rekomendasiId?: unknown) {
  const u = await HibahUsulan.find({ _id: { $in: ids.map((i) => oid(i)) } }).lean<HibahUsulanDoc[]>();
  if (u.length !== new Set(ids).size) throw tidakDitemukan('Usulan');
  for (const x of u) {
    if (String(x.skpdId) !== user.skpdId || x.tahun !== tahun) throw new Galat('VALIDASI', `Usulan ${x.nomor} bukan milik PD ini atau bukan tahun ${tahun}`);
    const sudahDiSini = rekomendasiId && String(x.rekomendasiId) === String(rekomendasiId) && x.status === 'dalam_rekomendasi';
    if (!sudahDiSini && x.status !== 'layak') throw new Galat('VALIDASI', `Usulan ${x.nomor} belum berstatus Layak (BR-08)`);
    await cekJadwalPd(x);
  }
  return u;
}

async function masukkan(user: SessionUser, ids: unknown[], rekId: unknown, session: import('mongoose').ClientSession) {
  for (const id of ids) {
    const r = await HibahUsulan.findOneAndUpdate(
      { _id: id, status: 'layak' },
      { $set: { status: transisi('layak', 'masuk_rekomendasi'), rekomendasiId: rekId }, $push: { riwayatStatus: catat('dalam_rekomendasi', user) } },
      { session },
    );
    if (!r) throw galatBerubah();
  }
}
async function keluarkan(user: SessionUser, ids: unknown[], session: import('mongoose').ClientSession, catatan: string) {
  for (const id of ids) {
    await HibahUsulan.findOneAndUpdate(
      { _id: id, status: 'dalam_rekomendasi' },
      { $set: { status: transisi('dalam_rekomendasi', 'keluar_rekomendasi'), rekomendasiId: null }, $push: { riwayatStatus: catat('layak', user, catatan) } },
      { session },
    );
  }
}

export async function daftarRekomendasi(user: SessionUser, f: { tahun?: number } = {}) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const tahun = f.tahun ?? (await tahunAktif()).tahun;
  const d = await HibahRekomendasi.find({ tahun, ...cakupanDbHibah(user), status: { $ne: 'batal' } }).sort({ createdAt: -1 }).lean<HibahRekomendasiDoc[]>();
  const pd = await Skpd.find({ _id: { $in: d.map((x) => x.skpdId) } }, { nama: 1 }).lean();
  const nama = new Map(pd.map((p) => [String(p._id), p.nama]));
  const nilai = await HibahUsulan.aggregate<{ _id: unknown; usulan: number; rekomendasi: number }>([
    { $match: { rekomendasiId: { $in: d.map((x) => x._id) } } },
    { $group: { _id: '$rekomendasiId', usulan: { $sum: '$nilaiUsulan' }, rekomendasi: { $sum: '$nilaiRekomendasi' } } },
  ]);
  const per = new Map(nilai.map((n) => [String(n._id), n]));
  return ser({
    tahun,
    data: d.map((r) => ({ ...r, namaPd: nama.get(String(r.skpdId)) ?? '', nilaiUsulan: per.get(String(r._id))?.usulan ?? 0, nilaiRekomendasi: per.get(String(r._id))?.rekomendasi ?? 0 })),
  });
}

/** Usulan Layak milik PD yang belum masuk rekomendasi (pilihan saat membuat dokumen). */
export async function usulanLayak(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_rekomendasi');
  await sambung();
  const t = await tahunAktif();
  const u = await HibahUsulan.find({ tahun: t.tahun, skpdId: oid(user.skpdId), status: 'layak' }, { nomor: 1, penerimaId: 1, nilaiUsulan: 1, nilaiRekomendasi: 1, bentuk: 1 }).lean();
  const p = await HibahPenerima.find({ _id: { $in: u.map((x) => x.penerimaId) } }, { nama: 1 }).lean();
  const nama = new Map(p.map((x) => [String(x._id), x.nama]));
  return ser(u.map((x) => ({ ...x, namaPenerima: nama.get(String(x.penerimaId)) ?? '' })));
}

export async function detailRekomendasi(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const r = await muatRekomendasi(user, id);
  const u = await HibahUsulan.find({ _id: { $in: r.usulanIds } }, { nomor: 1, penerimaId: 1, nilaiUsulan: 1, nilaiRekomendasi: 1, status: 1, bentuk: 1 }).lean();
  const p = await HibahPenerima.find({ _id: { $in: u.map((x) => x.penerimaId) } }, { nama: 1 }).lean();
  const nama = new Map(p.map((x) => [String(x._id), x.nama]));
  const [pd, berkas] = await Promise.all([
    Skpd.findById(r.skpdId, { nama: 1 }).lean(),
    r.berkasId ? HibahBerkas.findById(r.berkasId, { nama: 1, status: 1, createdAt: 1 }).lean() : null,
  ]);
  return ser({ ...r, namaPd: pd?.nama ?? '', usulan: u.map((x) => ({ ...x, namaPenerima: nama.get(String(x.penerimaId)) ?? '' })), berkas, pemilik: peranHibah(user) === 'operator_pd' && String(r.skpdId) === user.skpdId });
}

export async function buatRekomendasi(user: SessionUser, input: z.infer<typeof S.rekomendasiInput>) {
  pastikanBolehHibah(user, 'hibah_rekomendasi');
  await sambung();
  const t = await tahunAktif();
  const ids = [...new Set(input.usulanIds)];
  await ambilUsulanUntukRekomendasi(user, ids, t.tahun);
  const d = await dalamTransaksi(async (session) => {
    const [r] = await HibahRekomendasi.create(
      [
        {
          tahun: t.tahun,
          skpdId: oid(user.skpdId),
          nomor: input.nomor,
          tanggal: input.tanggal,
          perihal: input.perihal || 'Rekomendasi Calon Penerima Hibah dan Bantuan Sosial',
          kepalaPd: { nama: input.kepalaPdNama, nip: input.kepalaPdNip },
          usulanIds: ids.map((i) => oid(i)),
          status: 'draf',
        },
      ],
      { session },
    );
    await masukkan(user, ids.map((i) => oid(i)), r._id, session);
    return r;
  });
  return ser(d.toObject());
}

export async function ubahRekomendasi(user: SessionUser, id: string, input: z.infer<typeof S.rekomendasiUbah>) {
  pastikanBolehHibah(user, 'hibah_rekomendasi');
  await sambung();
  const r = await muatRekomendasi(user, id);
  pastikanOperatorPemilik(user, r);
  if (r.status !== 'draf') throw new Galat('VALIDASI', 'Dokumen yang sudah diunggah tidak bisa diubah');
  const set: Record<string, unknown> = {};
  for (const k of ['nomor', 'tanggal', 'perihal'] as const) if (input[k] !== undefined) set[k] = input[k];
  if (input.kepalaPdNama !== undefined) set['kepalaPd.nama'] = input.kepalaPdNama;
  if (input.kepalaPdNip !== undefined) set['kepalaPd.nip'] = input.kepalaPdNip;
  await dalamTransaksi(async (session) => {
    if (input.usulanIds) {
      const baru = [...new Set(input.usulanIds)];
      await ambilUsulanUntukRekomendasi(user, baru, r.tahun, r._id);
      const lama = r.usulanIds.map(String);
      await keluarkan(user, lama.filter((x) => !baru.includes(x)).map((x) => oid(x)), session, 'Dikeluarkan dari dokumen rekomendasi');
      await masukkan(user, baru.filter((x) => !lama.includes(x)).map((x) => oid(x)), r._id, session);
      set.usulanIds = baru.map((x) => oid(x));
    }
    const d = await HibahRekomendasi.findOneAndUpdate({ _id: r._id, updatedAt: syaratVersi(input.updatedAt) }, { $set: set }, { session, new: true });
    if (!d) throw galatBerubah();
  });
  return detailRekomendasi(user, id);
}

/** FR-28: selama belum diunggah, dokumen bisa dibatalkan dan usulan kembali Layak. */
export async function batalkanRekomendasi(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_rekomendasi');
  await sambung();
  const r = await muatRekomendasi(user, id);
  pastikanOperatorPemilik(user, r);
  if (r.status !== 'draf') throw new Galat('VALIDASI', 'Dokumen yang sudah diunggah tidak bisa dibatalkan');
  await dalamTransaksi(async (session) => {
    await keluarkan(user, r.usulanIds, session, 'Dokumen rekomendasi dibatalkan');
    await HibahRekomendasi.findOneAndUpdate({ _id: r._id }, { $set: { status: 'batal' } }, { session });
  });
  return { ok: true };
}

/** Data pengisi templat rekomendasi (FR-26). */
async function dataRekomendasi(r: HibahRekomendasiDoc) {
  const [pd, usulan] = await Promise.all([Skpd.findById(r.skpdId, { nama: 1 }).lean(), HibahUsulan.find({ _id: { $in: r.usulanIds } }).sort({ nomor: 1 }).lean<HibahUsulanDoc[]>()]);
  const [penerima, jenis] = await Promise.all([
    HibahPenerima.find({ _id: { $in: usulan.map((u) => u.penerimaId) } }, { nama: 1, alamat: 1, desaKode: 1, kecamatanKode: 1 }).lean(),
    HibahJenisPenerima.find({}, { kode: 1, nama: 1 }).lean(),
  ]);
  const [desa, kec] = await Promise.all([
    WilayahDesa.find({ kode: { $in: penerima.map((p) => p.desaKode).filter(Boolean) } }, { kode: 1, nama: 1 }).lean(),
    WilayahKecamatan.find({ kode: { $in: penerima.map((p) => p.kecamatanKode).filter(Boolean) } }, { kode: 1, nama: 1 }).lean(),
  ]);
  const p = new Map(penerima.map((x) => [String(x._id), x]));
  const nd = new Map(desa.map((x) => [x.kode, x.nama]));
  const nk = new Map(kec.map((x) => [x.kode, x.nama]));
  const nj = new Map(jenis.map((x) => [x.kode, x.nama]));
  const alamat = (x?: (typeof penerima)[number]) =>
    x ? [x.alamat, x.desaKode && `Desa/Kel. ${nd.get(x.desaKode) ?? ''}`, x.kecamatanKode && `Kec. ${nk.get(x.kecamatanKode) ?? ''}`].filter(Boolean).join(', ') : '';
  const namaPd = pd?.nama ?? '';
  return {
    nomor: r.nomor,
    tanggal: tanggalPanjang(r.tanggal),
    perihal: r.perihal,
    tahun: r.tahun,
    namaPd,
    namaPdKapital: namaPd.toUpperCase(),
    alamatKop: '',
    kepalaPdNama: r.kepalaPd?.nama ?? '',
    kepalaPdNip: r.kepalaPd?.nip ?? '',
    totalUsulan: rpTeks(usulan.reduce((a, u) => a + u.nilaiUsulan, 0)),
    totalRekomendasi: rpTeks(usulan.reduce((a, u) => a + u.nilaiRekomendasi, 0)),
    usulan: usulan.map((u, i) => ({
      no: i + 1,
      nama: p.get(String(u.penerimaId))?.nama ?? '',
      alamat: alamat(p.get(String(u.penerimaId))),
      jenis: nj.get(u.jenisPenerimaKode) ?? u.jenisPenerimaKode,
      bentuk: u.bentuk === 'uang' ? 'Uang' : 'Barang',
      subkegiatan: `${u.subkegiatanKode} ${u.subkegiatanNama}`.trim(),
      nilaiUsulan: rpTeks(u.nilaiUsulan),
      nilaiRekomendasi: rpTeks(u.nilaiRekomendasi),
    })),
    lampiran: usulan.map((u, i) => ({
      no: i + 1,
      nama: p.get(String(u.penerimaId))?.nama ?? '',
      nomorUsulan: u.nomor,
      nilaiUsulan: rpTeks(u.nilaiUsulan),
      nilaiRekomendasiTotal: rpTeks(u.nilaiRekomendasi),
      rincian: u.rincian.map((x, k) => ({
        no: k + 1,
        uraian: [x.uraian, x.spesifikasi].filter(Boolean).join(' – '),
        volume: x.volume.toLocaleString('id-ID'),
        satuan: x.satuan,
        hargaSatuan: rpTeks(x.hargaSatuan),
        jumlah: rpTeks(x.jumlah),
        nilaiRekomendasi: rpTeks(x.nilaiRekomendasi),
      })),
    })),
  };
}

export async function unduhRekomendasi(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const r = await muatRekomendasi(user, id);
  const t = await ambilTemplat('rekomendasi', String(r.skpdId));
  const isi = isiTemplat(t.isi, await dataRekomendasi(r));
  return { namaFile: `rekomendasi-${r.nomor.replace(/[^\w.-]+/g, '-')}.docx`, isi, templat: t.sumber };
}

/** FR-27: pindaian bertanda tangan diunggah → dokumen dan usulan di dalamnya terkunci (Rekomendasi Diunggah). */
export async function unggahRekomendasi(user: SessionUser, id: string, berkas: { nama: string; isi: Buffer }) {
  pastikanBolehHibah(user, 'hibah_rekomendasi');
  await sambung();
  const r = await muatRekomendasi(user, id);
  pastikanOperatorPemilik(user, r);
  if (r.status !== 'draf') throw new Galat('VALIDASI', 'Dokumen ini sudah diunggah');
  const usulan = await HibahUsulan.find({ _id: { $in: r.usulanIds } }).lean<HibahUsulanDoc[]>();
  for (const u of usulan) await cekJadwalPd(u);
  const b = await terimaBerkas(user, { pemilikJenis: 'rekomendasi', pemilikId: String(r._id), jenisDokumen: 'rekomendasi_ttd', nama: berkas.nama, isi: berkas.isi }, { tanpaHakTulis: true });
  await dalamTransaksi(async (session) => {
    for (const u of usulan) {
      const ok = await HibahUsulan.findOneAndUpdate(
        { _id: u._id, status: 'dalam_rekomendasi', rekomendasiId: r._id },
        {
          $set: { status: transisi('dalam_rekomendasi', 'unggah_rekomendasi'), nilaiRekomendasiTerakhirDisahkan: u.nilaiRekomendasi, 'verifikasi.keputusan': null },
          $push: { riwayatStatus: catat('rekomendasi_diunggah', user, `Rekomendasi ${r.nomor}`) },
        },
        { session },
      );
      if (!ok) throw galatBerubah();
    }
    await HibahRekomendasi.findOneAndUpdate(
      { _id: r._id, status: 'draf' },
      { $set: { status: 'diunggah', berkasId: oid((b as { _id: unknown })._id), cuplikan: usulan.map((u) => ({ usulanId: u._id, nilaiUsulan: u.nilaiUsulan, nilaiRekomendasi: u.nilaiRekomendasi })) } },
      { session },
    );
  });
  return detailRekomendasi(user, id);
}
