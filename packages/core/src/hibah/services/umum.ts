import type { ClientSession } from 'mongoose';
import {
  HibahJadwal, HibahNomor, HibahTahun, Skpd, idValid, oid, sambung,
  type HibahJadwalDoc, type HibahTahunDoc, type TahapanHibah,
} from '@danboy/db';
import { Galat, tidakDitemukan } from '../../galat';
import { cakupanHibah, peranHibah, type SessionUser } from '../../akses';
import { pastikanDalamJadwal } from '../aturan';

/** Serialisasi aman untuk dikirim ke klien (ObjectId dan Date menjadi string). */
export const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function pastikanIdHibah(id: unknown, apa = 'Data'): string {
  const s = id === null || id === undefined ? '' : String(id);
  if (!idValid(s)) throw tidakDitemukan(apa);
  return s;
}

/** Filter cakupan dalam bentuk ObjectId; Operator PD hanya PD-nya. */
export function cakupanDbHibah(user: SessionUser): { skpdId?: ReturnType<typeof oid> } {
  const c = cakupanHibah(user);
  return c.skpdId ? { skpdId: oid(c.skpdId) } : {};
}

export const operatorPd = (user: SessionUser) => peranHibah(user) === 'operator_pd';

/** Tahun anggaran aktif modul; melempar galat bila belum ada. */
export async function tahunAktif(session?: ClientSession | null): Promise<HibahTahunDoc> {
  await sambung();
  const t = await HibahTahun.findOne({ aktif: true }).session(session ?? null).lean<HibahTahunDoc>();
  if (!t) throw new Galat('VALIDASI', 'Belum ada tahun anggaran aktif. Admin Perencana perlu mengatur Tahun dan Jadwal.');
  return t;
}

export async function tahunAktifAtauNull(): Promise<HibahTahunDoc | null> {
  await sambung();
  return HibahTahun.findOne({ aktif: true }).lean<HibahTahunDoc>();
}

export async function muatJadwal(tahun: number, tahapan: TahapanHibah, session?: ClientSession | null) {
  return HibahJadwal.findOne({ tahun, tahapan }).session(session ?? null).lean<HibahJadwalDoc>();
}

/** BR-11: aksi terkunci di luar jadwal tahapannya, kecuali PD yang diberi perpanjangan. */
export async function cekJadwal(tahun: number, tahapan: TahapanHibah, skpdId?: string | null, session?: ClientSession | null) {
  pastikanDalamJadwal(await muatJadwal(tahun, tahapan, session), tahapan, skpdId);
}

/** BR-12: hasil verifikasi terkunci untuk tahun itu atau PD itu. */
export async function terkunci(tahun: number, skpdId: string, session?: ClientSession | null): Promise<boolean> {
  const t = await HibahTahun.findOne({ tahun }).session(session ?? null).lean<HibahTahunDoc>();
  if (!t) return false;
  return !!t.kunciTahun?.terkunci || t.kunciPd.some((k) => String(k.skpdId) === skpdId && k.terkunci);
}

export async function pastikanTidakTerkunci(tahun: number, skpdId: string, session?: ClientSession | null) {
  if (await terkunci(tahun, skpdId, session))
    throw new Galat('TAHAPAN_TERKUNCI', 'Hasil verifikasi sudah dikunci. Admin Perencana dapat membuka kunci dengan alasan.');
}

/** Nomor urut berikut (atomik). */
export async function nomorBerikut(kunci: string, session?: ClientSession | null): Promise<number> {
  const d = await HibahNomor.findOneAndUpdate({ _id: kunci }, { $inc: { nilai: 1 } }, { upsert: true, new: true, session: session ?? undefined }).lean();
  return d!.nilai;
}

/** Konkurensi optimistis: perubahan hanya berlaku bila dokumen belum diubah orang lain sejak dibaca. */
export function syaratVersi(updatedAt: string) {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) throw new Galat('VALIDASI', 'Versi data tidak valid');
  return d;
}
export const galatBerubah = () => new Galat('DATA_BERUBAH', 'Data sudah diubah pengguna lain. Muat ulang halaman lalu ulangi.');

export async function petaNamaPd(ids: unknown[]): Promise<Map<string, string>> {
  const d = await Skpd.find({ _id: { $in: ids.map((i) => oid(i)) } }, { nama: 1 }).lean();
  return new Map(d.map((s) => [String(s._id), s.nama]));
}
