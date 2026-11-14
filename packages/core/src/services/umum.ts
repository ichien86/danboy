import type { ClientSession } from 'mongoose';
import { Tahapan, oid, idValid, sambung, type TahapanDoc } from '@danboy/db';
import { Galat, tidakDitemukan } from '../galat';
import { cakupan, type SessionUser } from '../akses';

export const ambangMendekati = () => Number(process.env.AMBANG_MENDEKATI_PERSEN ?? 90) || 90;
export const batasUnggahMb = () => Number(process.env.UPLOAD_MAX_MB ?? 20) || 20;

/** cakupan() dalam bentuk filter MongoDB (ObjectId). */
export function cakupanDb(user: SessionUser): { skpdId?: ReturnType<typeof oid> } {
  const c = cakupan(user);
  return c.skpdId ? { skpdId: oid(c.skpdId) } : {};
}

export function pastikanId(id: unknown, apa = 'Data'): string {
  const s = id === null || id === undefined ? '' : String(id);
  if (!idValid(s)) throw tidakDitemukan(apa);
  return s;
}

export async function muatTahapan(id: unknown, session?: ClientSession | null): Promise<TahapanDoc> {
  await sambung();
  const t = await Tahapan.findById(pastikanId(id, 'Tahapan')).session(session ?? null).lean<TahapanDoc>();
  if (!t) throw tidakDitemukan('Tahapan');
  return t;
}

const tgl = (d: Date) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(d));

/** R10: setiap mutasi data anggaran hanya boleh pada tahapan terbuka. */
export async function pastikanTahapanTerbuka(tahapanId: unknown, session?: ClientSession | null): Promise<TahapanDoc> {
  const t = await muatTahapan(tahapanId, session);
  if (t.status !== 'terbuka') {
    const pesan =
      t.status === 'ditutup'
        ? `Tahapan ${t.nama} ditutup sejak ${tgl(t.ditutupPada ?? t.jadwalSelesai)}`
        : `Tahapan ${t.nama} belum dibuka (jadwal mulai ${tgl(t.jadwalMulai)})`;
    throw new Galat('TAHAPAN_TERKUNCI', pesan, { tahapanId: String(t._id), status: t.status });
  }
  return t;
}

export interface Halaman<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const keString = <T extends Record<string, unknown>>(o: T) => JSON.parse(JSON.stringify(o));
