import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

const JENIS = ['3a', '3b', '4a', '4b'] as const;
export const GET = rute<{ jenis: string }>(async ({ user, params, query }) => {
  if (!(JENIS as readonly string[]).includes(params.jenis)) throw new Galat('TIDAK_DITEMUKAN', 'Lampiran tidak dikenal');
  const d = await svc.eksporLampiranPerkada(user, Number(query.tahun), params.jenis as (typeof JENIS)[number]);
  return unduh(d.namaFile, d.isi);
});
