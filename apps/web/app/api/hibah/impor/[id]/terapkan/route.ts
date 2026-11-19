import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const POST = rute<{ id: string }>(async ({ user, params }) => svc.terapkanImporHibah(user, params.id));
