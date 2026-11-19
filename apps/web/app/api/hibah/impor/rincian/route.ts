import { rute, bacaForm, berkasDari } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

export const POST = rute(async ({ req, user }) => {
  const fd = await bacaForm(req, 5);
  const f = await berkasDari(fd, 'file');
  if (!f) throw new Galat('VALIDASI', 'Berkas wajib dipilih');
  return { rincian: await svc.rincianDariExcel(user, { bentuk: fd.get('bentuk') === 'barang' ? 'barang' : 'uang', namaFile: f.nama, isi: f.isi }) };
});
