import { rute, bacaForm, berkasDari } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

/** multipart: pemilikJenis, pemilikId, jenisDokumen, file (maks. 5 MB, PDF/JPG/PNG) */
export const POST = rute(async ({ req, user }) => {
  const fd = await bacaForm(req, 6);
  const f = await berkasDari(fd, 'file');
  if (!f) throw new Galat('VALIDASI', 'Berkas wajib dipilih');
  const pemilikJenis = String(fd.get('pemilikJenis'));
  if (pemilikJenis !== 'usulan' && pemilikJenis !== 'penerima') throw new Galat('VALIDASI', 'Pemilik berkas tidak dikenal');
  const jenisDokumen = String(fd.get('jenisDokumen') || 'lainnya').replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'lainnya';
  return svc.terimaBerkas(user, { pemilikJenis, pemilikId: String(fd.get('pemilikId')), jenisDokumen, nama: f.nama, isi: f.isi });
});
