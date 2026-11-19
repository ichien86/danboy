import { randomBytes } from 'node:crypto';
import { HibahDrive, sambung, type HibahDriveDoc } from '@danboy/db';
import { Galat } from '../galat';
import { dekripsi, enkripsi } from './rahasia';

/*
 * Penyimpanan berkas modul (TDD bagian Google Drive). Lapisan ini sengaja tipis: layanan hanya mengenal
 * antarmuka PenyimpananBerkas, sehingga uji otomatis memakai penyimpanan di memori dan Drive nyata hanya
 * dipakai di server. Klien Drive memakai REST API v3 lewat fetch, tanpa paket googleapis.
 */

export interface PenyimpananBerkas {
  /** Simpan berkas di folder `jalur` (dibuat bila belum ada); mengembalikan ID berkas. Berkas tidak pernah dibagikan. */
  simpan(jalur: string[], nama: string, mime: string, isi: Buffer): Promise<string>;
  ambil(id: string): Promise<Buffer>;
  kuota(): Promise<{ total: number | null; dipakai: number | null }>;
}

/** Penyimpanan di memori untuk uji: mencatat jalur folder agar uji bisa memeriksanya (AC-10). */
export class PenyimpananMemori implements PenyimpananBerkas {
  berkas = new Map<string, { jalur: string[]; nama: string; mime: string; isi: Buffer; publik: false }>();
  gagal = 0;
  async simpan(jalur: string[], nama: string, mime: string, isi: Buffer) {
    if (this.gagal > 0) {
      this.gagal--;
      throw new Error('Drive tiruan: gagal sementara');
    }
    const id = `mem-${randomBytes(6).toString('hex')}`;
    this.berkas.set(id, { jalur, nama, mime, isi, publik: false });
    return id;
  }
  async ambil(id: string) {
    const b = this.berkas.get(id);
    if (!b) throw new Galat('TIDAK_DITEMUKAN', 'Berkas tidak ada di penyimpanan');
    return b.isi;
  }
  async kuota() {
    return { total: 15 * 1024 ** 3, dipakai: [...this.berkas.values()].reduce((a, b) => a + b.isi.length, 0) };
  }
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER_AKAR = 'Verifikasi TAPD';

function konfigOauth() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const rahasia = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!id || !rahasia || !redirect)
    throw new Galat('VALIDASI', 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI belum diatur di pengaturan server');
  return { id, rahasia, redirect };
}

/** URL persetujuan Google; cakupan drive.file = aplikasi hanya melihat berkas yang dibuatnya sendiri. */
export function urlOauth(state: string): string {
  const k = konfigOauth();
  const p = new URLSearchParams({
    client_id: k.id,
    redirect_uri: k.redirect,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function minta<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(url, { ...rest, headers: { ...(rest.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {
    const teks = await res.text().catch(() => '');
    const e = new Error(`Google ${res.status}: ${teks.slice(0, 300)}`) as Error & { status: number; invalidGrant: boolean };
    e.status = res.status;
    e.invalidGrant = teks.includes('invalid_grant');
    throw e;
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : Buffer.from(await res.arrayBuffer())) as Promise<T>;
}

/** Tukar kode OAuth dengan token, simpan refresh token terenkripsi, dan siapkan folder akar. */
export async function sambungDrive(kode: string, userId: string) {
  const k = konfigOauth();
  const t = await minta<{ access_token: string; refresh_token?: string }>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: kode, client_id: k.id, client_secret: k.rahasia, redirect_uri: k.redirect, grant_type: 'authorization_code' }),
  });
  if (!t.refresh_token) throw new Galat('VALIDASI', 'Google tidak mengirim refresh token. Cabut akses aplikasi di akun Google, lalu hubungkan ulang.');
  const about = await minta<{ user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } }>(
    `${DRIVE}/about?fields=user(emailAddress),storageQuota(limit,usage)`,
    { token: t.access_token },
  );
  const akar = await minta<{ id: string }>(`${DRIVE}/files?fields=id`, {
    method: 'POST',
    token: t.access_token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_AKAR, mimeType: 'application/vnd.google-apps.folder' }),
  });
  await sambung();
  await HibahDrive.findOneAndUpdate(
    { kunci: 'utama' },
    {
      $set: {
        email: about.user?.emailAddress ?? '',
        tokenTerenkripsi: enkripsi(t.refresh_token),
        folderAkarId: akar.id,
        folder: {},
        status: 'terhubung',
        terhubungOleh: userId,
        kuota: { total: num(about.storageQuota?.limit), dipakai: num(about.storageQuota?.usage), diperbarui: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  tokenCache = null;
}

const num = (s?: string) => (s ? Number(s) : null);
let tokenCache: { token: string; sampai: number } | null = null;

class PenyimpananGoogle implements PenyimpananBerkas {
  private async akun(): Promise<HibahDriveDoc> {
    await sambung();
    const d = await HibahDrive.findOne({ kunci: 'utama' }).lean<HibahDriveDoc>();
    if (!d || d.status !== 'terhubung' || !d.tokenTerenkripsi) throw new Galat('VALIDASI', 'Google Drive belum terhubung');
    return d;
  }
  private async token(): Promise<string> {
    if (tokenCache && tokenCache.sampai > Date.now() + 60_000) return tokenCache.token;
    const d = await this.akun();
    const k = konfigOauth();
    try {
      const t = await minta<{ access_token: string; expires_in: number }>(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: k.id, client_secret: k.rahasia, refresh_token: dekripsi(d.tokenTerenkripsi), grant_type: 'refresh_token' }),
      });
      tokenCache = { token: t.access_token, sampai: Date.now() + t.expires_in * 1000 };
      return t.access_token;
    } catch (e) {
      // token dicabut atau kedaluwarsa: tandai putus agar Admin Perencana diminta menghubungkan ulang
      if ((e as { invalidGrant?: boolean }).invalidGrant) await HibahDrive.updateOne({ kunci: 'utama' }, { $set: { status: 'putus' } });
      throw e;
    }
  }
  private async folder(jalur: string[]): Promise<string> {
    const d = await this.akun();
    let induk = d.folderAkarId;
    const peta = { ...(d.folder ?? {}) };
    let berubah = false;
    for (let i = 0; i < jalur.length; i++) {
      const kunci = jalur.slice(0, i + 1).join('/');
      if (!peta[kunci]) {
        const f = await minta<{ id: string }>(`${DRIVE}/files?fields=id`, {
          method: 'POST',
          token: await this.token(),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: jalur[i].slice(0, 200), mimeType: 'application/vnd.google-apps.folder', parents: [induk] }),
        });
        peta[kunci] = f.id;
        berubah = true;
      }
      induk = peta[kunci];
    }
    if (berubah) await HibahDrive.updateOne({ kunci: 'utama' }, { $set: { folder: peta } });
    return induk;
  }
  async simpan(jalur: string[], nama: string, mime: string, isi: Buffer) {
    const induk = await this.folder(jalur);
    const batas = `danboy${randomBytes(8).toString('hex')}`;
    const meta = JSON.stringify({ name: nama.slice(0, 250), parents: [induk] });
    const badan = Buffer.concat([
      Buffer.from(`--${batas}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${batas}\r\nContent-Type: ${mime}\r\n\r\n`),
      isi,
      Buffer.from(`\r\n--${batas}--`),
    ]);
    const r = await minta<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      token: await this.token(),
      headers: { 'Content-Type': `multipart/related; boundary=${batas}` },
      body: badan,
    });
    return r.id;
  }
  async ambil(id: string) {
    return minta<Buffer>(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, { token: await this.token() });
  }
  async kuota() {
    const a = await minta<{ storageQuota?: { limit?: string; usage?: string } }>(`${DRIVE}/about?fields=storageQuota(limit,usage)`, { token: await this.token() });
    const k = { total: num(a.storageQuota?.limit), dipakai: num(a.storageQuota?.usage) };
    await HibahDrive.updateOne({ kunci: 'utama' }, { $set: { kuota: { ...k, diperbarui: new Date() } } });
    return k;
  }
}

let aktif: PenyimpananBerkas | null = null;
/** Uji otomatis memasang PenyimpananMemori; server memakai Google Drive. */
export function aturPenyimpanan(p: PenyimpananBerkas | null) {
  aktif = p;
}
export const penyimpanan = (): PenyimpananBerkas => aktif ?? new PenyimpananGoogle();
