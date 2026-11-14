import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const PATCH = rute<{ id: string }>(async ({ req, user, params }) =>
  svc.ubahPengguna(user, params.id, await bodyJson(req, S.penggunaUbah)),
);
