import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.statusKunci(user, Number(query.tahun)));
export const POST = rute(async ({ req, user }) => svc.kunciHasil(user, await bodyJson(req, S.kunciInput)));
