import { rute } from '@/lib/api';
import * as svc from '@danboy/core/services';

/** Daftar bidang urusan (tanpa X.XX) untuk memilih pengganti kode penunjang. */
export const GET = rute(async ({ user }) => svc.daftarBidangUrusan(user));
