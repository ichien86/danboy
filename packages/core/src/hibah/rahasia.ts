import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Galat } from '../galat';

/*
 * Enkripsi identitas (NIK, nomor KK, nomor badan hukum) dan token Google, serta sidik HMAC untuk cek duplikat
 * tanpa membuka nilainya (TDD bagian Keamanan dan Privasi). Kunci hanya dari variabel lingkungan.
 */

function kunci(nama: 'KUNCI_ENKRIPSI' | 'KUNCI_SIDIK'): Buffer {
  const v = process.env[nama]?.trim();
  if (!v) throw new Galat('GALAT_SERVER', `${nama} belum diatur di pengaturan server`);
  const k = Buffer.from(v, 'base64');
  if (k.length !== 32) throw new Galat('GALAT_SERVER', `${nama} harus 32 bita dalam base64`);
  return k;
}

/** AES-256-GCM; format "v1:<iv>:<tag>:<sandi>" (base64). */
export function enkripsi(teks: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', kunci('KUNCI_ENKRIPSI'), iv);
  const isi = Buffer.concat([c.update(teks, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), isi.toString('base64')].join(':');
}

export function dekripsi(s: string): string {
  const [v, iv, tag, isi] = s.split(':');
  if (v !== 'v1' || !iv || !tag || !isi) throw new Galat('GALAT_SERVER', 'Format data terenkripsi tidak dikenal');
  const d = createDecipheriv('aes-256-gcm', kunci('KUNCI_ENKRIPSI'), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(isi, 'base64')), d.final()]).toString('utf8');
}

/** Normalisasi nomor identitas: tanpa spasi, titik, strip; huruf besar. */
export const normalIdentitas = (s: string) => s.replace(/[\s.\-/]/g, '').toUpperCase();

/** Sidik HMAC-SHA256; jenis ikut dihitung agar NIK dan nomor badan hukum yang kebetulan sama tidak bertabrakan. */
export function sidik(jenis: string, nilai: string): string {
  const grup = jenis === 'nik_kk' ? 'nik' : jenis;
  return createHmac('sha256', kunci('KUNCI_SIDIK')).update(`${grup}:${normalIdentitas(nilai)}`).digest('base64url');
}

/** 3309•••••••••0001: 4 depan dan 4 belakang; nomor pendek hanya 2 belakang. */
export function samaran(nilai: string): string {
  const n = normalIdentitas(nilai);
  if (n.length <= 6) return '•'.repeat(Math.max(0, n.length - 2)) + n.slice(-2);
  return n.slice(0, 4) + '•'.repeat(n.length - 8 > 0 ? n.length - 8 : 2) + n.slice(-4);
}

export function bungkusIdentitas(jenis: string, nilai: string) {
  return { jenis, sandi: enkripsi(normalIdentitas(nilai)), sidik: sidik(jenis, nilai), samaran: samaran(nilai) };
}
