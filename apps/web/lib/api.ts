import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { Galat, type SessionUser } from '@danboy/core';
import { denganKonteks } from '@danboy/core/services';
import { ambilSesi } from './sesi';

export interface KonteksApi<P> {
  req: NextRequest;
  user: SessionUser;
  params: P;
  query: Record<string, string>;
}

function responsGalat(e: unknown) {
  if (e instanceof Galat || (e as Error)?.name === 'Galat') {
    const g = e as Galat;
    return NextResponse.json({ galat: { kode: g.kode, pesan: g.message, detail: g.detail } }, { status: g.http });
  }
  if (e instanceof ZodError || (e as Error)?.name === 'ZodError') {
    const z = e as ZodError;
    const detail = Object.fromEntries(z.issues.map((i) => [i.path.join('.') || '_', i.message]));
    return NextResponse.json({ galat: { kode: 'VALIDASI', pesan: z.issues[0]?.message ?? 'Input tidak valid', detail } }, { status: 400 });
  }
  console.error('[api] galat tak terduga', e);
  return NextResponse.json({ galat: { kode: 'GALAT_SERVER', pesan: 'Terjadi kesalahan di server' } }, { status: 500 });
}

/**
 * Pembungkus route handler: sesi valid → konteks audit (pengguna, IP) → fungsi service.
 * Route handler hanya memvalidasi input dan memanggil service; service tidak tahu soal HTTP.
 */
export function rute<P = Record<string, string>>(fn: (k: KonteksApi<P>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const user = await ambilSesi();
      if (!user) throw new Galat('BELUM_LOGIN', 'Sesi tidak ada atau kedaluwarsa');
      const params = (await ctx?.params) ?? ({} as P);
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? undefined;
      const query = Object.fromEntries(req.nextUrl.searchParams.entries());
      const hasil = await denganKonteks({ userId: user.id, ip }, () => fn({ req, user, params, query }));
      if (hasil instanceof Response) return hasil;
      return NextResponse.json(hasil ?? { ok: true });
    } catch (e) {
      return responsGalat(e);
    }
  };
}

export async function bodyJson<S extends ZodTypeAny>(req: NextRequest, skema: S): Promise<z.infer<S>> {
  let j: unknown;
  try {
    j = await req.json();
  } catch {
    throw new Galat('VALIDASI', 'Badan permintaan bukan JSON yang valid');
  }
  return skema.parse(j);
}

export const angka = (v: string | undefined, bawaan?: number) => {
  if (v === undefined || v === '') return bawaan;
  const n = Number(v);
  return Number.isFinite(n) ? n : bawaan;
};

export function unduh(namaFile: string, isi: Buffer, opsi: { mime?: string; inline?: boolean } = {}) {
  const mime =
    opsi.mime ?? (namaFile.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return new Response(new Uint8Array(isi), {
    headers: {
      'Content-Type': mime,
      // nama berkas ASCII untuk peramban lama, nama asli (UTF-8) lewat filename*
      'Content-Disposition': `${opsi.inline ? 'inline' : 'attachment'}; filename="${namaFile.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(namaFile)}`,
      'Cache-Control': 'no-store',
    },
  });
}
