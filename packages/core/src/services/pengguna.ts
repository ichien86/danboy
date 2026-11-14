import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { LogAudit, Skpd, User, catatAudit, oid, sambung, type UserDoc } from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { escapeRegex, pastikanId } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** argon2id, parameter OWASP minimum (19 MiB, t=2). */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashSandi = (s: string) => hash(s, ARGON);

const MAKS_GAGAL = 5;
const KUNCI_MENIT = 15;

/** Sandi sementara 14 karakter tanpa karakter ambigu. */
export function sandiSementara(): string {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const angka = '23456789';
  const semua = huruf + angka;
  const s = [huruf[randomInt(24)], huruf[24 + randomInt(24)], angka[randomInt(angka.length)]];
  while (s.length < 14) s.push(semua[randomInt(semua.length)]);
  for (let i = s.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s.join('');
}

export interface HasilLogin {
  ok: boolean;
  user?: SessionUser & { wajibGantiSandi: boolean };
  alasan?: 'salah' | 'terkunci' | 'nonaktif';
  terkunciSampai?: Date;
}

/** Verifikasi login; setelah 5 kali gagal akun dikunci 15 menit. */
export async function verifikasiLogin(username: string, password: string, ip?: string): Promise<HasilLogin> {
  await sambung();
  const u = await User.findOne({ username: username.toLowerCase().trim() }).select('+passwordHash').lean<UserDoc>();
  if (!u) {
    // samakan waktu respons agar keberadaan username tidak terungkap
    await hashSandi(password).catch(() => undefined);
    return { ok: false, alasan: 'salah' };
  }
  if (!u.aktif) return { ok: false, alasan: 'nonaktif' };
  if (u.terkunciSampai && u.terkunciSampai > new Date()) return { ok: false, alasan: 'terkunci', terkunciSampai: u.terkunciSampai };
  const cocok = await verify(u.passwordHash, password).catch(() => false);
  if (!cocok) {
    const gagal = (u.gagalLogin ?? 0) + 1;
    const kunci = gagal >= MAKS_GAGAL ? new Date(Date.now() + KUNCI_MENIT * 60_000) : null;
    await User.updateOne({ _id: u._id }, { $set: { gagalLogin: kunci ? 0 : gagal, terkunciSampai: kunci } });
    await catatAudit({ aksi: kunci ? 'akun_dikunci' : 'login_gagal', koleksi: 'user', dokumenId: u._id, userId: String(u._id), ip });
    return kunci ? { ok: false, alasan: 'terkunci', terkunciSampai: kunci } : { ok: false, alasan: 'salah' };
  }
  await User.updateOne({ _id: u._id }, { $set: { gagalLogin: 0, terkunciSampai: null } });
  await catatAudit({ aksi: 'login', koleksi: 'user', dokumenId: u._id, userId: String(u._id), ip });
  return {
    ok: true,
    user: {
      id: String(u._id),
      username: u.username,
      nama: u.nama,
      peran: u.peran,
      skpdId: u.skpdId ? String(u.skpdId) : null,
      wajibGantiSandi: u.wajibGantiSandi,
    },
  };
}

export async function gantiSandi(user: SessionUser, sandiLama: string, sandiBaru: string) {
  await sambung();
  const u = await User.findById(user.id).select('+passwordHash').lean<UserDoc>();
  if (!u) throw tidakDitemukan('Pengguna');
  if (!(await verify(u.passwordHash, sandiLama).catch(() => false))) throw new Galat('VALIDASI', 'Sandi lama salah', { sandiLama: 'Sandi lama salah' });
  if (sandiLama === sandiBaru) throw new Galat('VALIDASI', 'Sandi baru harus berbeda dari sandi lama');
  await User.findOneAndUpdate({ _id: u._id }, { $set: { passwordHash: await hashSandi(sandiBaru), wajibGantiSandi: false } });
  // passwordHash tidak terbaca plugin audit (select:false), jadi dicatat eksplisit
  await catatAudit({ aksi: 'ganti_sandi', koleksi: 'user', dokumenId: u._id, userId: user.id });
  return { ok: true };
}

export async function daftarPengguna(user: SessionUser, f: { q?: string; peran?: string } = {}) {
  pastikanBoleh(user, 'kelola_pengguna');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (f.peran) filter.peran = f.peran;
  if (f.q) filter.$or = [{ username: { $regex: escapeRegex(f.q), $options: 'i' } }, { nama: { $regex: escapeRegex(f.q), $options: 'i' } }];
  const data = await User.find(filter).sort({ peran: 1, username: 1 }).populate('skpdId', 'kode nama').lean();
  const terakhir = await LogAudit.aggregate<{ _id: unknown; waktu: Date }>([
    { $match: { koleksi: 'user', aksi: 'login', dokumenId: { $in: data.map((d) => d._id) } } },
    { $group: { _id: '$dokumenId', waktu: { $max: '$waktu' } } },
  ]);
  const per = new Map(terakhir.map((t) => [String(t._id), t.waktu]));
  return ser(data.map((d) => ({ ...d, loginTerakhir: per.get(String(d._id)) ?? null })));
}

export async function buatPengguna(user: SessionUser, input: z.infer<typeof S.penggunaInput>) {
  pastikanBoleh(user, 'kelola_pengguna');
  await sambung();
  if (input.peran === 'skpd' && !(await Skpd.exists({ _id: oid(input.skpdId) }))) throw tidakDitemukan('SKPD');
  const sandi = sandiSementara();
  const d = await User.create({
    username: input.username.toLowerCase(),
    nama: input.nama,
    peran: input.peran,
    skpdId: input.peran === 'skpd' ? oid(input.skpdId) : null,
    passwordHash: await hashSandi(sandi),
    wajibGantiSandi: true,
  }).catch((e) => {
    if ((e as { code?: number }).code === 11000) throw new Galat('VALIDASI', 'Username sudah dipakai', { username: 'Username sudah dipakai' });
    throw e;
  });
  const { passwordHash, ...rest } = d.toObject();
  void passwordHash;
  return { pengguna: ser(rest), sandiSementara: sandi };
}

export async function ubahPengguna(user: SessionUser, id: string, input: z.infer<typeof S.penggunaUbah>) {
  pastikanBoleh(user, 'kelola_pengguna');
  await sambung();
  const _id = oid(pastikanId(id, 'Pengguna'));
  if (String(_id) === user.id && (input.aktif === false || (input.peran && input.peran !== 'super_admin')))
    throw new Galat('VALIDASI', 'Tidak bisa menonaktifkan atau menurunkan peran akun sendiri');
  const lama = await User.findById(_id).lean<UserDoc>();
  if (!lama) throw tidakDitemukan('Pengguna');
  const peran = input.peran ?? lama.peran;
  const skpdId = input.skpdId !== undefined ? input.skpdId : lama.skpdId ? String(lama.skpdId) : null;
  if (peran === 'skpd' && !skpdId) throw new Galat('VALIDASI', 'Akun SKPD wajib memilih SKPD', { skpdId: 'Wajib diisi' });
  const set: Record<string, unknown> = { ...input, skpdId: peran === 'skpd' && skpdId ? oid(skpdId) : null };
  const d = await User.findOneAndUpdate({ _id }, { $set: set }, { new: true }).populate('skpdId', 'kode nama').lean();
  return ser(d);
}

export async function resetSandi(user: SessionUser, id: string) {
  pastikanBoleh(user, 'kelola_pengguna');
  await sambung();
  const sandi = sandiSementara();
  const d = await User.findOneAndUpdate(
    { _id: oid(pastikanId(id, 'Pengguna')) },
    { $set: { passwordHash: await hashSandi(sandi), wajibGantiSandi: true, gagalLogin: 0, terkunciSampai: null } },
    { new: true },
  ).lean();
  if (!d) throw tidakDitemukan('Pengguna');
  await catatAudit({ aksi: 'reset_sandi', koleksi: 'user', dokumenId: d._id, userId: user.id });
  return { sandiSementara: sandi };
}

export async function statusPengguna(id: string) {
  await sambung();
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  return User.findById(id).select('aktif wajibGantiSandi peran skpdId nama').lean<UserDoc>();
}
