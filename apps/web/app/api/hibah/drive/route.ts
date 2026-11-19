import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => svc.statusDrive(user, query.segarkan === '1'));
export const DELETE = rute(async ({ user }) => svc.putuskanDrive(user));
