import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { peranHibah } from '@danboy/core';
import { KepalaHalaman, Kosong, TautanTombol } from '@/components/ui';
import { wajibSesi } from '@/lib/sesi';
import { AKAR_HIBAH, butirHibah } from '@/lib/menu';

export const metadata: Metadata = { title: 'Hibah dan Bansos' };

/**
 * Penampung untuk menu modul yang halamannya belum dibangun. Halaman sungguhan di folder sendiri
 * (mis. hibah-bansos/master/page.tsx) otomatis didahulukan oleh router, jadi berkas ini tidak perlu diubah per fase.
 */
export default async function BelumTersedia({ params }: { params: Promise<{ segmen: string[] }> }) {
  const { segmen } = await params;
  const user = await wajibSesi();
  const b = butirHibah(`${AKAR_HIBAH}/${segmen.join('/')}`);
  // alamat yang tidak ada di menu, atau menu yang bukan untuk peran ini, diperlakukan sebagai tidak ada
  const p = peranHibah(user);
  if (!b || !p || !b.peran.includes(p)) notFound();
  return (
    <>
      <KepalaHalaman judul={b.label} />
      <div className="rounded-lg border border-garis bg-permukaan">
        <Kosong judul={`${b.label} dibangun di fase ${b.fase}`}>
          <p>Halaman ini belum tersedia. Menu sudah disiapkan agar susunan modul bisa ditinjau sejak awal.</p>
          <div className="mt-4">
            <TautanTombol href={AKAR_HIBAH}>Kembali ke dashboard</TautanTombol>
          </div>
        </Kosong>
      </div>
    </>
  );
}
