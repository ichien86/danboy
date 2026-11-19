import { rute, angka, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => {
  const d = await svc.eksporRekap(user, angka(query.tahun));
  return unduh(d.namaFile, d.isi);
});
