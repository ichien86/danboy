'use server';

import { statusPengguna } from '@danboy/core/services';
import { auth, unstable_update } from '@/auth';

/** Perbarui token sesi setelah sandi diganti, hanya bila basis data sudah mencatatnya. */
export async function tandaiSandiDiganti() {
  const s = await auth();
  if (!s?.user?.id) return;
  const u = await statusPengguna(s.user.id);
  if (u && !u.wajibGantiSandi) await unstable_update({ wajibGantiSandi: false } as never);
}
