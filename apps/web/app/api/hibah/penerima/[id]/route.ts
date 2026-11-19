import { rute, bacaForm, berkasDari, jsonDariForm } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params, query }) => svc.detailPenerima(user, params.id, { bukaIdentitas: query.identitas === 'buka' }));
export const PATCH = rute<{ id: string }>(async ({ req, user, params }) => {
  const fd = await bacaForm(req, 11);
  return svc.ubahPenerima(user, params.id, S.penerimaUbah.parse(jsonDariForm(fd)), { ktp: await berkasDari(fd, 'ktp'), kk: await berkasDari(fd, 'kk') });
});
