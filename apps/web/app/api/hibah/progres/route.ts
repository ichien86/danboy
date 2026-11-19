import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => svc.progresPd(user, angka(query.tahun)));
