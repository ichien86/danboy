import { rute, bodyJson, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarRekomendasi(user, { tahun: angka(query.tahun) }));
export const POST = rute(async ({ req, user }) => svc.buatRekomendasi(user, await bodyJson(req, S.rekomendasiInput)));
