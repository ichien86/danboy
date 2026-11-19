import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const POST = rute(async ({ user }) => svc.ulangiBerkasGagal(user));
