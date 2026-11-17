import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params, query }) =>
  svc.daftarSubkegiatan(user, params.id, S.filterSubkegiatan.parse(query)),
);
export const POST = rute<{ id: string }>(async ({ req, user, params }) => svc.tambahSubkegiatan(user, params.id, await bodyJson(req, S.subkegiatanBaru)));
