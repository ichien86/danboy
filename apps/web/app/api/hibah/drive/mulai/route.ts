import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rute } from '@/lib/api';
import { pastikanBolehHibah } from '@danboy/core';
import { urlOauth } from '@danboy/core/services';

/** Mulai OAuth Google (FR-49): state acak disimpan di cookie httpOnly 10 menit untuk dicocokkan di callback. */
export const GET = rute(async ({ user, req }) => {
  pastikanBolehHibah(user, 'hibah_kelola_drive');
  const state = randomBytes(24).toString('base64url');
  const res = NextResponse.redirect(urlOauth(state));
  res.cookies.set('hibah_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', maxAge: 600, path: '/api/hibah/drive' });
  return res;
});
