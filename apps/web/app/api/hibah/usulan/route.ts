import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarUsulan(user, S.filterUsulan.parse(query)));
export const POST = rute(async ({ req, user }) => svc.buatUsulan(user, await bodyJson(req, S.usulanInput)));
