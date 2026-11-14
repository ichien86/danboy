import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute(async ({ user, query }) => svc.daftarNomenklatur(user, { induk: query.induk, q: query.q, versi: query.versi }));
