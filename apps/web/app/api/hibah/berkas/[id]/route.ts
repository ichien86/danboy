import { rute, unduh } from '@/lib/api';
import * as svc from '@danboy/core/services';

export const GET = rute<{ id: string }>(async ({ user, params }) => {
  const b = await svc.bukaBerkas(user, params.id);
  return unduh(b.nama, b.isi, { mime: b.mime, inline: true });
});
export const DELETE = rute<{ id: string }>(async ({ user, params }) => svc.hapusBerkas(user, params.id));
