import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { z } from 'zod';

const skema = z.object({ selesai: z.boolean() }).strict();

/** Centang pengingat "sudah disesuaikan di SIPD" (akun SKPD: hanya subkegiatan SKPD-nya). */
export const PATCH = rute<{ batchId: string; id: string }>(async ({ req, user, params }) =>
  svc.tandaiHasilVerifikasi(user, params.batchId, params.id, (await bodyJson(req, skema)).selesai),
);
