import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => {
  const jenis = query.jenis === 'berita_acara' || query.jenis === 'lampiran' ? query.jenis : 'rekomendasi';
  const t = await svc.unduhTemplat(user, jenis, query.bawaan === '1');
  return unduh(t.namaFile, t.isi);
});
