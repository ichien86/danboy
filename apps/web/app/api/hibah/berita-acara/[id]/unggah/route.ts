import { rute, bacaForm, berkasDari } from '@/lib/api';
import * as svc from '@danboy/core/services';
import { Galat } from '@danboy/core';

export const POST = rute<{ id: string }>(async ({ req, user, params }) => {
  const f = await berkasDari(await bacaForm(req, 6), 'file');
  if (!f) throw new Galat('VALIDASI', 'Pindaian bertanda tangan wajib dipilih');
  return svc.unggahBeritaAcara(user, params.id, f);
});
