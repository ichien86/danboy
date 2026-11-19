import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { hitungNotifikasiTerbuka } from '@danboy/core/services';
import { semuaTahapan, tahapanAktif, wajibSesi } from '@/lib/sesi';
import { kerangkaModul, MODUL } from '@/lib/menu';
import { LoncengNotifikasi, PemilihTahapan, PencarianCepat, TombolTema } from '@/components/klien';
import { Kerangka } from '@/components/kerangka';

export const dynamic = 'force-dynamic';

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const user = await wajibSesi();
  // akun tanpa peran DANBOY (mis. Admin Perencana) hanya memakai modul Hibah dan Bansos
  if (!user.peran) redirect(MODUL.hibah.href);
  // daftar tahapan dibaca bersamaan; halaman memakai hasil yang sama (cache per permintaan)
  const [semua, aktif] = await Promise.all([semuaTahapan(), tahapanAktif()]);
  const notif = aktif ? await hitungNotifikasiTerbuka(user, String(aktif._id)) : { total: 0, kritis: 0 };
  const opsi = semua.map((t) => ({ _id: String(t._id), nama: t.nama, tahun: t.tahun, status: t.status }));
  return (
    <Kerangka
      {...kerangkaModul(user, 'danboy')}
      bilah={
        <>
          <Suspense>
            <PemilihTahapan daftar={opsi} aktifId={aktif ? String(aktif._id) : undefined} />
          </Suspense>
          <div className="ml-auto flex items-center gap-1">
            <PencarianCepat tahapanId={aktif ? String(aktif._id) : undefined} />
            <LoncengNotifikasi tahapanId={aktif ? String(aktif._id) : undefined} awal={notif} />
            <TombolTema />
          </div>
        </>
      }
    >
      {children}
    </Kerangka>
  );
}
