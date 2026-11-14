import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) =>
  svc.daftarSumberDana(user, { q: query.q, khusus: query.khusus === undefined ? undefined : query.khusus === 'true' }),
);
export const POST = rute(async ({ req, user }) => svc.buatSumberDana(user, await bodyJson(req, S.sumberDanaInput)));
