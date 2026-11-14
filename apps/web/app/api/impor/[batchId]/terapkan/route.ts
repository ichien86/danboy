import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

/** Body opsional { konfirmasi: true } bila ada baris yang ditahan. */
export const POST = rute<{ batchId: string }>(async ({ req, user, params }) => {
  const body = (await req.json().catch(() => ({}))) as { konfirmasi?: unknown };
  return svc.terapkanImpor(user, params.batchId, { konfirmasi: body?.konfirmasi === true });
});
