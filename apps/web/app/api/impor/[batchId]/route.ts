import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ batchId: string }>(async ({ user, params, query }) =>
  svc.statusImpor(user, params.batchId, {
    bagian: query.bagian as 'hasil' | 'ditahan' | 'baris' | undefined,
    aturan: query.aturan,
    page: angka(query.page, 1),
    limit: angka(query.limit, 50),
  }),
);
