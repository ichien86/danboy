import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user }) => svc.daftarTahunHibah(user));
export const POST = rute(async ({ req, user }) => svc.buatTahunHibah(user, await bodyJson(req, S.tahunHibahInput)));
