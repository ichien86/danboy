import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const GET = rute<{ id: string }>(async ({ user, params }) => svc.detailUsulan(user, params.id));
export const PATCH = rute<{ id: string }>(async ({ req, user, params }) => svc.ubahUsulan(user, params.id, await bodyJson(req, S.usulanUbah)));
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.hapusUsulan(user, params.id));
