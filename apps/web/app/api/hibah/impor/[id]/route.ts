import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params }) => svc.lihatImporHibah(user, params.id));
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.batalImporHibah(user, params.id));
