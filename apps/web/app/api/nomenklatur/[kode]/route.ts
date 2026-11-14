import { rute, angka, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ kode: string }>(async ({ user, params, query }) =>
  svc.detailNomenklatur(user, decodeURIComponent(params.kode), angka(query.tahun)),
);
/** PATCH memakai id dokumen nomenklatur (bukan kode), agar entri nonaktif juga bisa diaktifkan lagi. */
export const PATCH = rute<{ kode: string }>(async ({ req, user, params }) =>
  svc.ubahNomenklatur(user, params.kode, await bodyJson(req, S.nomenklaturUbah)),
);
