import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

/** Bahan formulir tambah subkegiatan: ?q= cari di master nomenklatur, ?kode= info tagging kode akhir. */
export const GET = rute<{ id: string }>(async ({ user, params, query }) => svc.calonSubkegiatan(user, params.id, { q: query.q, kode: query.kode }));
