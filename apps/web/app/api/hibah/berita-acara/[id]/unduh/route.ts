import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params, query }) => {
  const bagian = query.bagian === 'lampiran-1' || query.bagian === 'lampiran-2' ? query.bagian : 'ba';
  const d = await svc.unduhBeritaAcara(user, params.id, bagian);
  return unduh(d.namaFile, d.isi);
});
