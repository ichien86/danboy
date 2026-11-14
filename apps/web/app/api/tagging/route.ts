import { rute, bodyJson, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) =>
  svc.daftarTagging(user, {
    tahun: angka(query.tahun, new Date().getFullYear())!,
    sumberDanaId: query.sumberDanaId,
    kodeSubkegiatan: query.kodeSubkegiatan,
    page: angka(query.page, 1),
    limit: angka(query.limit, 50),
  }),
);
export const POST = rute(async ({ req, user }) => svc.buatTagging(user, await bodyJson(req, S.taggingInput)));
