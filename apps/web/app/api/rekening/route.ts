import { rute, angka, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarRekening(user, { q: query.q, page: angka(query.page, 1), limit: angka(query.limit, 50) }));
export const POST = rute(async ({ req, user }) => svc.buatRekening(user, await bodyJson(req, S.rekeningInput)));
