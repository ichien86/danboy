import { rute, bodyJson, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarBeritaAcara(user, angka(query.tahun)));
export const POST = rute(async ({ req, user }) => svc.buatBeritaAcara(user, await bodyJson(req, S.beritaAcaraInput)));
