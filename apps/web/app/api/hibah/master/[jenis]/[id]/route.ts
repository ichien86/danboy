import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';
import { Galat } from '@danboy/core';

export const PATCH = rute<{ jenis: string; id: string }>(async ({ req, user, params }) => {
  if (!(S.JENIS_MASTER_HIBAH as readonly string[]).includes(params.jenis)) throw new Galat('TIDAK_DITEMUKAN', 'Master tidak dikenal');
  return svc.simpanMasterHibah(user, params.jenis as S.JenisMasterHibah, params.id, await req.json());
});
