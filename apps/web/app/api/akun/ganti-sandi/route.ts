import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';

export const POST = rute(async ({ req, user }) => {
  const b = await bodyJson(req, S.gantiSandi);
  return svc.gantiSandi(user, b.sandiLama, b.sandiBaru);
});
