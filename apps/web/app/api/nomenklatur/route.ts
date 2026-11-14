import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarNomenklatur(user, { induk: query.induk, q: query.q, versi: query.versi }));
export const POST = rute(async ({ req, user }) => svc.buatNomenklatur(user, await bodyJson(req, S.nomenklaturInput)));
