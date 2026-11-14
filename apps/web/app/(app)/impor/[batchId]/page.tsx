import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { statusImpor } from '@danboy/core/services';
import { wajibSesi } from '@/lib/sesi';
import { DetailImpor } from './detail';

export const metadata: Metadata = { title: 'Detail impor' };

export default async function HalamanDetailImpor({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const user = await wajibSesi();
  if (!boleh(user, 'impor')) redirect('/dasbor');
  const awal = await statusImpor(user, batchId).catch(() => null);
  if (!awal) notFound();
  if ((awal.batch as { jenis?: string }).jenis === 'verifikasi') redirect(`/verifikasi/${batchId}`);
  return <DetailImpor batchId={batchId} awal={awal.batch as never} />;
}
