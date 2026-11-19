'use server';

import { signOut } from '@/auth';

/** Hapus cookie sesi; perpindahan ke halaman login dilakukan browser (muat penuh), bukan redirect di action. */
export async function keluar() {
  await signOut({ redirect: false });
}
