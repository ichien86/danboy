import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ batchId: string }>(async ({ user, params }) => {
  const e = await svc.eksporVerifikasi(user, params.batchId);
  return unduh(e.namaFile, e.isi);
});
