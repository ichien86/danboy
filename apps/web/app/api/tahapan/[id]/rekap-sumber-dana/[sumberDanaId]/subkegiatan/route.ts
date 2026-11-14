import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string; sumberDanaId: string }>(async ({ user, params, query }) =>
  svc.subkegiatanPerSumberDana(user, params.id, params.sumberDanaId, angka(query.page, 1), Math.min(angka(query.limit, 50)!, 200)),
);
