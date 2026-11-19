import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user }) => svc.opsiHibah(user));
