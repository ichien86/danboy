import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.nonaktifkanTemplat(user, params.id));
