import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => svc.daftarVerifikasi(user, query.tahapanId, { page: angka(query.page, 1), limit: angka(query.limit, 20) }));
