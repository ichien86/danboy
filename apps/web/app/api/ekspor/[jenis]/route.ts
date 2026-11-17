import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';
import { Galat } from '@danboy/core';

const JENIS = ['rekap', 'matriks', 'notifikasi', 'subkegiatan'] as const;

export const GET = rute<{ jenis: string }>(async ({ user, params, query }) => {
  if (!JENIS.includes(params.jenis as (typeof JENIS)[number])) throw new Galat('TIDAK_DITEMUKAN', 'Jenis ekspor tidak dikenal');
  // saringan halaman Matriks/Subkegiatan; nilai kosong dari form = tanpa saringan
  const isi = (k: string) => query[k] || undefined;
  const saringan = S.filterSubkegiatan.parse({ q: isi('q'), skpd: isi('skpd'), sumberDana: isi('sumberDana'), status: isi('status'), jumlahSd: isi('jumlahSd') });
  const e = await svc.ekspor(user, params.jenis as (typeof JENIS)[number], query.tahapanId, saringan);
  return unduh(e.namaFile, e.isi);
});
