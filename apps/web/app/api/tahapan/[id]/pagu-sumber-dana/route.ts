import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params }) => svc.daftarPaguSumberDana(user, params.id));
export const PUT = rute<{ id: string }>(async ({ req, user, params }) =>
  svc.simpanPaguSumberDana(user, params.id, (await bodyJson(req, S.paguSumberDanaInput)).pagu),
);
