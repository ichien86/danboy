import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) =>
  svc.daftarAudit(user, {
    koleksi: query.koleksi,
    dokumenId: query.dokumenId,
    userId: query.userId,
    aksi: query.aksi,
    page: angka(query.page, 1),
    limit: angka(query.limit, 50),
  }),
);
