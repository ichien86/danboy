import { rute, bodyJson, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ query }) => svc.daftarTahapan(angka(query.tahun)));
export const POST = rute(async ({ req, user }) => svc.buatTahapan(user, await bodyJson(req, S.tahapanInput)));
