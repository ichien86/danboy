import type { ClientSession } from 'mongoose';
import { Tahapan, cacheTahapan, oid, idValid, sambung, type TahapanDoc } from '@danboy/db';
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

const UMUR_CACHE_TAHAPAN = 5_000;

/** Simpan dokumen tahapan yang baru dibaca ke cache singkat (lihat cacheTahapan). */
export function ingatTahapan(t: { _id: unknown }) {
  cacheTahapan.set(String(t._id), { doc: t, waktu: Date.now() });
}

/**
 * Dokumen tahapan untuk keperluan baca. Tanpa session memakai cache singkat (±5 detik, dikosongkan setiap ada
 * perubahan tahapan); dengan session atau `segar` selalu dibaca dari basis data.
 */
export async function muatTahapan(id: unknown, session?: ClientSession | null, segar = false): Promise<TahapanDoc> {
  await sambung();
  const kunci = pastikanId(id, 'Tahapan');
  if (!session && !segar) {
    const c = cacheTahapan.get(kunci);
    if (c && Date.now() - c.waktu < UMUR_CACHE_TAHAPAN) {
      const t = c.doc as TahapanDoc;
      return { ...t, _id: oid(String(t._id)) } as TahapanDoc;
    }
  }
  const t = await Tahapan.findById(kunci).session(session ?? null).lean<TahapanDoc>();
  if (!t) throw tidakDitemukan('Tahapan');
  if (!session) ingatTahapan(t);
  return t;
}

const tgl = (d: Date) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(d));

/** R10: setiap mutasi data anggaran hanya boleh pada tahapan terbuka. */
export async function pastikanTahapanTerbuka(tahapanId: unknown, session?: ClientSession | null): Promise<TahapanDoc> {
  // selalu dibaca langsung dari basis data, tidak dari cache
  const t = await muatTahapan(tahapanId, session, true);
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
