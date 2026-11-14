import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';
import { Galat } from '@danboy/core';

const JENIS = ['rekap', 'matriks', 'notifikasi', 'subkegiatan'] as const;

export const GET = rute<{ jenis: string }>(async ({ user, params, query }) => {
  if (!JENIS.includes(params.jenis as (typeof JENIS)[number])) throw new Galat('TIDAK_DITEMUKAN', 'Jenis ekspor tidak dikenal');
  const e = await svc.ekspor(user, params.jenis as (typeof JENIS)[number], query.tahapanId);
  return unduh(e.namaFile, e.isi);
});
