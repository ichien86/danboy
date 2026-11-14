import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const POST = rute<{ id: string }>(async ({ user, params, query }) =>
  svc.ikutSipdSemua(user, params.id, S.filterSubkegiatan.parse(query)),
);
