import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarPengguna(user, { q: query.q, peran: query.peran }));
export const POST = rute(async ({ req, user }) => svc.buatPengguna(user, await bodyJson(req, S.penggunaInput)));
