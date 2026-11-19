import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

const JENIS = ['riwayat', 'wilayah', 'rincian-uang', 'rincian-barang'] as const;
export const GET = rute<{ jenis: string }>(async ({ params }) => {
  if (!(JENIS as readonly string[]).includes(params.jenis)) throw new Galat('TIDAK_DITEMUKAN', 'Templat tidak dikenal');
  const t = await svc.templatImporHibah(params.jenis as (typeof JENIS)[number]);
  return unduh(t.namaFile, t.isi);
});
