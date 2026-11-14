import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const POST = rute<{ batchId: string }>(async ({ user, params }) => svc.terapkanImpor(user, params.batchId));
