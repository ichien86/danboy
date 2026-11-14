import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ kode: string }>(async ({ user, params, query }) =>
  svc.detailNomenklatur(user, decodeURIComponent(params.kode), angka(query.tahun)),
);
