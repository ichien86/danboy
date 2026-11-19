import { NextResponse } from 'next/server';
import { rute } from '@/lib/api';
import { pastikanBolehHibah } from '@danboy/core';
import { sambungDrive } from '@danboy/core/services';

export const GET = rute(async ({ user, req, query }) => {
  pastikanBolehHibah(user, 'hibah_kelola_drive');
  const kembali = new URL('/hibah-bansos/drive', req.url);
  const state = req.cookies.get('hibah_oauth_state')?.value;
  if (query.error) kembali.searchParams.set('galat', `Google menolak: ${query.error}`);
  else if (!state || state !== query.state || !query.code) kembali.searchParams.set('galat', 'Sesi persetujuan tidak valid atau kedaluwarsa. Ulangi Hubungkan.');
  else {
    try {
      await sambungDrive(query.code, user.id);
      kembali.searchParams.set('ok', '1');
    } catch (e) {
      kembali.searchParams.set('galat', (e as Error).message.slice(0, 200));
    }
  }
  const res = NextResponse.redirect(kembali);
  res.cookies.delete({ name: 'hibah_oauth_state', path: '/api/hibah/drive' });
  return res;
});
