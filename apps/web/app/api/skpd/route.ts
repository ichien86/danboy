import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarSkpd(user, { q: query.q }));
export const POST = rute(async ({ req, user }) => svc.buatSkpd(user, await bodyJson(req, S.skpdInput)));
