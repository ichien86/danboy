import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const PUT = rute<{ id: string }>(async ({ req, user, params }) => svc.simpanVerifikasi(user, params.id, await bodyJson(req, S.verifikasiInput)));
