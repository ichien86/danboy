import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params }) => svc.detailSubkegiatan(user, params.id));
