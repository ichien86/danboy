import { rute, angka, bacaForm, berkasDari, jsonDariForm } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute(async ({ user, query }) => svc.daftarPenerima(user, { q: query.q, page: angka(query.page, 1), limit: angka(query.limit, 50) }));
/** multipart: data (JSON), ktp?, kk? */
export const POST = rute(async ({ req, user }) => {
  const fd = await bacaForm(req, 11);
  return svc.buatPenerima(user, S.penerimaInput.parse(jsonDariForm(fd)), { ktp: await berkasDari(fd, 'ktp'), kk: await berkasDari(fd, 'kk') });
});
