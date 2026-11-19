import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { kirimBerkasTertunda } from '@danboy/core/services';

/**
 * Dipanggil fungsi terjadwal Netlify setiap 5 menit (apps/web/netlify/functions/kirim-berkas.mts):
 * kirim ulang berkas yang masih menunggu ke Google Drive. Tanpa sesi pengguna; diamankan CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const rahasia = process.env.CRON_SECRET ?? '';
  const kiriman = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(rahasia);
  const b = Buffer.from(kiriman);
  if (!rahasia || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ galat: { kode: 'TIDAK_BERHAK', pesan: 'Tidak berhak' } }, { status: 403 });
  return NextResponse.json(await kirimBerkasTertunda());
}
