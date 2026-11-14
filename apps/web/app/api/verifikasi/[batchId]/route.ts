import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ batchId: string }>(async ({ user, params, query }) =>
  svc.hasilVerifikasi(user, params.batchId, {
    status: (query.status || undefined) as svc.FilterHasilVerifikasi['status'],
    tandai: query.tandai === 'belum' || query.tandai === 'sudah' ? query.tandai : undefined,
    skpd: query.skpd,
    q: query.q,
    page: angka(query.page, 1),
    limit: angka(query.limit, 50),
  }),
);
