import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => {
  const d = query.dimensi === 'jenis' || query.dimensi === 'bentuk' || query.dimensi === 'status' ? query.dimensi : 'pd';
  return svc.rekapHibah(user, angka(query.tahun), d);
});
