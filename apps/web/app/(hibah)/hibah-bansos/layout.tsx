import { redirect } from 'next/navigation';
import { bolehHibah, peranHibah } from '@danboy/core';
import { wajibSesi } from '@/lib/sesi';
import { kerangkaModul, MODUL } from '@/lib/menu';
import { TombolTema } from '@/components/klien';
import { Kerangka } from '@/components/kerangka';
import { PencarianHibah } from '@/components/hibah';

export const dynamic = 'force-dynamic';

export default async function LayoutHibah({ children }: { children: React.ReactNode }) {
  const user = await wajibSesi();
  // hak akses dicek di server; menyembunyikan menu saja tidak cukup (NFR-02)
  if (!peranHibah(user)) redirect(MODUL.danboy.href);
  return (
    <Kerangka
      {...kerangkaModul(user, 'hibah')}
      bilah={
        <div className="ml-auto flex items-center gap-1">
          <PencarianHibah aktif={bolehHibah(user, 'hibah_lihat_usulan')} />
          <TombolTema />
        </div>
      }
    >
      {children}
    </Kerangka>
  );
}
