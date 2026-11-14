import { rute, bodyJson } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { z } from 'zod';

const skema = z.object({ kategori: z.enum(['subkegiatan', 'sumber_dana', 'perangkat_daerah']) }).strict();

/** Tambahkan ke master rujukan yang belum ada (dari data file), lalu proses ulang impor. */
export const POST = rute<{ batchId: string }>(async ({ req, user, params }) =>
  svc.lengkapiMasterDariImpor(user, params.batchId, (await bodyJson(req, skema)).kategori),
);
