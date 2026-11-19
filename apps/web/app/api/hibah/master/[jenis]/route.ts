import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';
import { Galat } from '@danboy/core';

const jenis = (j: string) => {
  if (!(S.JENIS_MASTER_HIBAH as readonly string[]).includes(j)) throw new Galat('TIDAK_DITEMUKAN', 'Master tidak dikenal');
  return j as S.JenisMasterHibah;
};
export const GET = rute<{ jenis: string }>(async ({ user, params, query }) =>
  svc.daftarMasterHibah(user, jenis(params.jenis), { q: query.q, kecamatan: query.kecamatan, tahun: angka(query.tahun) }),
);
export const POST = rute<{ jenis: string }>(async ({ req, user, params }) => svc.simpanMasterHibah(user, jenis(params.jenis), null, await req.json()));
