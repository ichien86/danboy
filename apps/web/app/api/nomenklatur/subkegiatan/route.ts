import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

/** Cari subkegiatan di master nomenklatur: ?q= (min. 2 huruf). */
export const GET = rute(async ({ user, query }) => svc.cariSubkegiatanMaster(user, query.q));
