import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ params }) => svc.muatTahapan(params.id));
export const PATCH = rute<{ id: string }>(async ({ req, user, params }) =>
  svc.ubahTahapan(user, params.id, await bodyJson(req, S.tahapanUbah)),
);
