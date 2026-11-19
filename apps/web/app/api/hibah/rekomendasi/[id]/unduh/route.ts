import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params }) => {
  const d = await svc.unduhRekomendasi(user, params.id);
  return unduh(d.namaFile, d.isi);
});
