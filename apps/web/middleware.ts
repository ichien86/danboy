import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

const PUBLIK = ['/login', '/api/auth', '/api/kesehatan'];
const BOLEH_SAAT_WAJIB_GANTI = ['/ganti-sandi', '/api/akun/ganti-sandi', '/api/auth'];
const MUTASI = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const galat = (status: number, kode: string, pesan: string) =>
  NextResponse.json({ galat: { kode, pesan } }, { status });

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const api = pathname.startsWith('/api/');

  // CSRF: mutasi API harus berasal dari origin yang sama
  if (api && MUTASI.has(req.method) && !pathname.startsWith('/api/auth')) {
    const origin = req.headers.get('origin');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (origin && host && new URL(origin).host !== host) return galat(403, 'TIDAK_BERHAK', 'Origin tidak diizinkan');
  }

  if (PUBLIK.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    // hanya saat membuka halaman; kiriman form login (server action, POST) tidak dibelokkan walau masih ada sesi lama
    if (pathname === '/login' && req.method === 'GET' && req.auth) return NextResponse.redirect(new URL('/dasbor', req.url));
    return NextResponse.next();
  }
  if (!req.auth) {
    if (api) return galat(401, 'BELUM_LOGIN', 'Sesi tidak ada atau kedaluwarsa');
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('lanjut', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (req.auth.user?.wajibGantiSandi && !BOLEH_SAAT_WAJIB_GANTI.some((p) => pathname.startsWith(p))) {
    if (api) return galat(403, 'TIDAK_BERHAK', 'Ganti kata sandi terlebih dahulu');
    return NextResponse.redirect(new URL('/ganti-sandi', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
