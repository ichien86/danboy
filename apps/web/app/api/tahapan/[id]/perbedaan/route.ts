import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params, query }) =>
  svc.daftarPerbedaan(user, params.id, S.filterSubkegiatan.parse(query)),
);
