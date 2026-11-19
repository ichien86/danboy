import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { wajibSesi } from '@/lib/sesi';
import { alamatAwal } from '@/lib/menu';
import { COOKIE_MODUL } from '@/lib/cookie-modul';

/** Buka dashboard modul terakhir yang dipakai, atau modul pertama yang boleh diakses akun ini. */
export default async function Beranda() {
  const user = await wajibSesi();
  redirect(alamatAwal(user, (await cookies()).get(COOKIE_MODUL)?.value));
}
