import 'server-only';
import { notFound } from 'next/navigation';
import { bolehHibah, peranHibah, type AksiHibah, type SessionUser } from '@danboy/core';
import { wajibSesi } from './sesi';

export type SP = Promise<Record<string, string | string[] | undefined>>;

/** Sesi + pengecekan aksi modul; halaman yang bukan untuk peran ini diperlakukan sebagai tidak ada. */
export async function halamanHibah(aksi: AksiHibah | AksiHibah[], searchParams?: SP): Promise<{ user: SessionUser; sp: Record<string, string | undefined>; operator: boolean }> {
  const user = await wajibSesi();
  if (!(Array.isArray(aksi) ? aksi : [aksi]).some((a) => bolehHibah(user, a))) notFound();
  const raw = searchParams ? await searchParams : {};
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : undefined]));
  return { user, sp, operator: peranHibah(user) === 'operator_pd' };
}

/** Untuk komponen klien: Date/ObjectId sudah menjadi string lewat ser() di layanan. */
export type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
