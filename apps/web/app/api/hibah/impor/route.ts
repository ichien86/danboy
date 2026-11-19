import { rute, bacaForm, berkasDari } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

export const POST = rute(async ({ req, user }) => {
  const fd = await bacaForm(req, 20);
  const f = await berkasDari(fd, 'file');
  if (!f) throw new Galat('VALIDASI', 'Berkas wajib dipilih');
  const jenis = fd.get('jenis') === 'wilayah' ? 'wilayah' : 'riwayat';
  return svc.pratinjauImporHibah(user, { jenis, namaFile: f.nama, isi: f.isi });
});
