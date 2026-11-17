import { rute, bodyJson } from '@/lib/api';
import * as S from '@danboy/schema';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params }) => svc.detailSubkegiatan(user, params.id));
export const PATCH = rute<{ id: string }>(async ({ req, user, params }) => svc.ubahPaguSubkegiatan(user, params.id, await bodyJson(req, S.subkegiatanUbah)));
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.hapusSubkegiatan(user, params.id));
