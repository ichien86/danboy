import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async () => svc.daftarTahun());
export const POST = rute(async ({ req, user }) => svc.buatTahun(user, (await bodyJson(req, S.tahunInput)).tahun));
