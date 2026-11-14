import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@danboy/core';
import { pilihTahapan, statusPengguna } from '@danboy/core/services';
import { auth } from '@/auth';

/**
 * Pengguna dari sesi, diperiksa ulang ke basis data setiap permintaan:
 * akun nonaktif langsung ditolak, perubahan peran/SKPD langsung berlaku.
 */
export const ambilSesi = cache(async (): Promise<SessionUser | null> => {
  const s = await auth();
  if (!s?.user?.id) return null;
  const u = await statusPengguna(s.user.id);
  if (!u || !u.aktif) return null;
  return {
    id: s.user.id,
    username: s.user.username,
    nama: u.nama,
    peran: u.peran,
    skpdId: u.skpdId ? String(u.skpdId) : null,
  };
});

export async function wajibSesi(): Promise<SessionUser> {
  const u = await ambilSesi();
  if (!u) redirect('/login');
  return u;
}

export const COOKIE_TAHAPAN = 'danboy_tahapan';

/** Tahapan aktif: ?tahapan= lalu cookie, lalu tahapan terbuka terbaru. */
export async function tahapanAktif(searchParams?: { tahapan?: string | string[] }) {
  const dariUrl = typeof searchParams?.tahapan === 'string' ? searchParams.tahapan : undefined;
  const dariCookie = (await cookies()).get(COOKIE_TAHAPAN)?.value;
  return pilihTahapan(dariUrl ?? dariCookie);
}

export async function ipPermintaan() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined;
}
