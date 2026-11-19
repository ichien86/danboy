import { dalamTransaksi, HibahBeritaAcara, HibahJadwal, HibahTahun, oid, sambung, TAHAPAN_HIBAH, type HibahJadwalDoc, type HibahTahunDoc } from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, type SessionUser } from '../../akses';
import { dalamJadwal, LABEL_TAHAPAN_HIBAH, type TahapanHibah } from '../aturan';
import { petaNamaPd, pastikanIdHibah, ser } from './umum';

/** Dasar hukum awal Berita Acara (Permendagri 32/2011 tidak dicantumkan karena sudah dicabut). */
export const DASAR_HUKUM_AWAL = [
  'Peraturan Pemerintah Nomor 12 Tahun 2019 tentang Pengelolaan Keuangan Daerah',
  'Peraturan Menteri Dalam Negeri Nomor 77 Tahun 2020 tentang Pedoman Teknis Pengelolaan Keuangan Daerah',
  'Peraturan Menteri Dalam Negeri Nomor 17 Tahun 2026 tentang Pedoman Penyusunan Anggaran Pendapatan dan Belanja Daerah Tahun Anggaran 2027',
  'Peraturan Menteri Dalam Negeri Nomor 3 Tahun 2023 tentang Pengelolaan Dana Bantuan Operasional Satuan Pendidikan pada Pemerintah Daerah',
];

export async function daftarTahunHibah(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  return ser(await HibahTahun.find().sort({ tahun: -1 }).lean());
}

export async function buatTahunHibah(user: SessionUser, input: z.infer<typeof S.tahunHibahInput>) {
  pastikanBolehHibah(user, 'hibah_kelola_tahun');
  await sambung();
  if (await HibahTahun.exists({ tahun: input.tahun })) throw new Galat('VALIDASI', `Tahun ${input.tahun} sudah ada`);
  const adaAktif = await HibahTahun.exists({ aktif: true });
  const d = await HibahTahun.create({ tahun: input.tahun, aktif: !adaAktif, dasarHukum: DASAR_HUKUM_AWAL });
  return ser(d.toObject());
}

export async function ubahTahunHibah(user: SessionUser, tahun: number, input: z.infer<typeof S.tahunHibahUbah>) {
  pastikanBolehHibah(user, 'hibah_kelola_tahun');
  await sambung();
  if (!(await HibahTahun.exists({ tahun }))) throw tidakDitemukan('Tahun anggaran');
  await dalamTransaksi(async (session) => {
    if (input.aktif) {
      await HibahTahun.findOneAndUpdate({ aktif: true, tahun: { $ne: tahun } }, { $set: { aktif: false } }, { session });
      await HibahTahun.findOneAndUpdate({ tahun }, { $set: { aktif: true } }, { session });
    }
    if (input.dasarHukum) await HibahTahun.findOneAndUpdate({ tahun }, { $set: { dasarHukum: input.dasarHukum } }, { session });
  });
  return ser(await HibahTahun.findOne({ tahun }).lean());
}

/** Jadwal lima tahapan beserta status hari ini; dipakai halaman Tahun dan Jadwal, Timeline, dan dashboard. */
export async function ambilJadwal(user: SessionUser, tahun: number) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const d = await HibahJadwal.find({ tahun }).lean<HibahJadwalDoc[]>();
  const nama = await petaNamaPd(d.flatMap((j) => j.perpanjangan.map((p) => p.skpdId)));
  const sekarang = new Date();
  return ser(
    TAHAPAN_HIBAH.map((t) => {
      const j = d.find((x) => x.tahapan === t);
      const sisaHari = j ? Math.ceil((+j.selesai - +sekarang) / 86_400_000) : null;
      return {
        tahapan: t,
        label: LABEL_TAHAPAN_HIBAH[t],
        mulai: j?.mulai ?? null,
        selesai: j?.selesai ?? null,
        berjalan: dalamJadwal(j, null, sekarang),
        sisaHari,
        perpanjangan: (j?.perpanjangan ?? []).map((p) => ({ ...p, namaPd: nama.get(String(p.skpdId)) ?? '' })),
      };
    }),
  );
}

export async function simpanJadwal(user: SessionUser, tahun: number, input: z.infer<typeof S.jadwalInput>) {
  pastikanBolehHibah(user, 'hibah_kelola_tahun');
  await sambung();
  if (!(await HibahTahun.exists({ tahun }))) throw tidakDitemukan('Tahun anggaran');
  // tanggal yang sudah lewat boleh diisi (FR-37): siklus TA 2027 sudah berjalan
  for (const j of input.jadwal) {
    await HibahJadwal.findOneAndUpdate(
      { tahun, tahapan: j.tahapan },
      { $set: { mulai: j.mulai, selesai: j.selesai }, $setOnInsert: { perpanjangan: [] } },
      { upsert: true, new: true },
    );
  }
  return ambilJadwal(user, tahun);
}

export async function beriPerpanjangan(user: SessionUser, tahun: number, input: z.infer<typeof S.perpanjanganInput>) {
  pastikanBolehHibah(user, 'hibah_kelola_tahun');
  await sambung();
  const j = await HibahJadwal.findOne({ tahun, tahapan: input.tahapan }).lean<HibahJadwalDoc>();
  if (!j) throw new Galat('VALIDASI', 'Tahapan ini belum dijadwalkan');
  if (input.selesaiBaru <= j.selesai) throw new Galat('VALIDASI', 'Tanggal akhir baru harus setelah tanggal selesai tahapan', { selesaiBaru: 'Harus setelah tanggal selesai' });
  const lain = j.perpanjangan.filter((p) => String(p.skpdId) !== input.skpdId);
  await HibahJadwal.findOneAndUpdate(
    { _id: j._id },
    { $set: { perpanjangan: [...lain, { skpdId: oid(input.skpdId), selesaiBaru: input.selesaiBaru, alasan: input.alasan, oleh: oid(user.id), waktu: new Date() }] } },
  );
  return ambilJadwal(user, tahun);
}

export async function cabutPerpanjangan(user: SessionUser, tahun: number, tahapan: TahapanHibah, skpdId: string) {
  pastikanBolehHibah(user, 'hibah_kelola_tahun');
  await sambung();
  await HibahJadwal.findOneAndUpdate({ tahun, tahapan }, { $pull: { perpanjangan: { skpdId: oid(pastikanIdHibah(skpdId, 'PD')) } } });
  return ambilJadwal(user, tahun);
}

/* ---------- Kunci hasil (FR-36, BR-12) ---------- */

export async function statusKunci(user: SessionUser, tahun: number) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const t = await HibahTahun.findOne({ tahun }).lean<HibahTahunDoc>();
  if (!t) throw tidakDitemukan('Tahun anggaran');
  const nama = await petaNamaPd(t.kunciPd.map((k) => k.skpdId));
  return ser({
    tahun,
    kunciTahun: t.kunciTahun,
    kunciPd: t.kunciPd.map((k) => ({ ...k, namaPd: nama.get(String(k.skpdId)) ?? '' })),
    riwayatBukaKunci: t.riwayatBukaKunci,
    bolehKunci: bolehHibah(user, 'hibah_kunci'),
    bolehBuka: bolehHibah(user, 'hibah_buka_kunci'),
  });
}

export async function kunciHasil(user: SessionUser, input: z.infer<typeof S.kunciInput>) {
  pastikanBolehHibah(user, 'hibah_kunci');
  await sambung();
  const t = await HibahTahun.findOne({ tahun: input.tahun }).lean<HibahTahunDoc>();
  if (!t) throw tidakDitemukan('Tahun anggaran');
  const k = { terkunci: true, oleh: oid(user.id), waktu: new Date() };
  if (input.skpdId) {
    const lain = t.kunciPd.filter((x) => String(x.skpdId) !== input.skpdId);
    await HibahTahun.findOneAndUpdate({ _id: t._id }, { $set: { kunciPd: [...lain, { skpdId: oid(input.skpdId), ...k }] } });
  } else {
    await HibahTahun.findOneAndUpdate({ _id: t._id }, { $set: { kunciTahun: k } });
  }
  return statusKunci(user, input.tahun);
}

/** Membuka kunci tercatat beserta alasannya; Berita Acara yang sudah dibuat menjadi usang dan harus dicetak ulang. */
export async function bukaKunci(user: SessionUser, input: z.infer<typeof S.bukaKunciInput>) {
  pastikanBolehHibah(user, 'hibah_buka_kunci');
  await sambung();
  const t = await HibahTahun.findOne({ tahun: input.tahun }).lean<HibahTahunDoc>();
  if (!t) throw tidakDitemukan('Tahun anggaran');
  const catatan = { cakupan: input.skpdId ? `pd:${input.skpdId}` : 'tahun', alasan: input.alasan, oleh: oid(user.id), waktu: new Date() };
  await dalamTransaksi(async (session) => {
    const set: Record<string, unknown> = input.skpdId
      ? { kunciPd: t.kunciPd.filter((x) => String(x.skpdId) !== input.skpdId) }
      : { kunciTahun: { terkunci: false, oleh: null, waktu: null }, kunciPd: [] };
    await HibahTahun.findOneAndUpdate({ _id: t._id }, { $set: set, $push: { riwayatBukaKunci: catatan } }, { session });
    const ba = await HibahBeritaAcara.find({ tahun: input.tahun, status: { $ne: 'usang' } }).session(session).lean();
    for (const b of ba) {
      const kena = input.skpdId ? b.cakupan.semua || b.cakupan.skpdIds.some((s) => String(s) === input.skpdId) : true;
      if (kena) await HibahBeritaAcara.findOneAndUpdate({ _id: b._id }, { $set: { status: 'usang' } }, { session });
    }
  });
  return statusKunci(user, input.tahun);
}
