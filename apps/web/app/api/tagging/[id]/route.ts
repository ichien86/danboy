import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const PATCH = rute<{ id: string }>(async ({ req, user, params }) => svc.ubahTagging(user, params.id, await bodyJson(req, S.taggingUbah)));
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.hapusTagging(user, params.id));
