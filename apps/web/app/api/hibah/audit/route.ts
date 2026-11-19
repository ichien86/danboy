import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => svc.daftarAuditHibah(user, { page: angka(query.page, 1), koleksi: query.koleksi }));
