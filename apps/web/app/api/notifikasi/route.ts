import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) =>
  svc.daftarNotifikasi(user, {
    tahapanId: query.tahapanId,
    status: (query.status as 'terbuka' | 'selesai' | 'diabaikan') || undefined,
    aturan: query.aturan,
    page: angka(query.page, 1),
    limit: angka(query.limit, 50),
  }),
);
