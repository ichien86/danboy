import { rute, bacaForm, berkasDari } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

const JENIS = ['rekomendasi', 'berita_acara', 'lampiran'] as const;
export const GET = rute(async ({ user }) => svc.daftarTemplat(user));
export const POST = rute(async ({ req, user }) => {
  const fd = await bacaForm(req, 3);
  const f = await berkasDari(fd, 'file');
  if (!f) throw new Galat('VALIDASI', 'Berkas templat wajib dipilih');
  const jenis = String(fd.get('jenis'));
  if (!(JENIS as readonly string[]).includes(jenis)) throw new Galat('VALIDASI', 'Jenis templat tidak dikenal');
  return svc.unggahTemplat(user, { jenis: jenis as (typeof JENIS)[number], skpdId: (fd.get('skpdId') as string) || null, nama: f.nama, isi: f.isi });
});
