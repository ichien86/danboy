import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const POST = rute<{ id: string }>(async ({ req, user, params }) => {
  const b = await bodyJson(req, S.bukaTahapanInput).catch(() => ({ alasan: undefined }));
  return svc.bukaTahapan(user, params.id, b.alasan);
});
