import { rute, bodyJson, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params, query }) => svc.detailSumberDana(user, decodeURIComponent(params.id), angka(query.tahun)));
export const PATCH = rute<{ id: string }>(async ({ req, user, params }) =>
  svc.ubahSumberDana(user, params.id, await bodyJson(req, S.sumberDanaUbah)),
);
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.hapusSumberDana(user, params.id));
