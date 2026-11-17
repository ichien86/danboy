import { Suspense } from 'react';
import { boleh, LABEL_PERAN } from '@danboy/core';
import { hitungNotifikasiTerbuka } from '@danboy/core/services';
import { semuaTahapan, tahapanAktif, wajibSesi } from '@/lib/sesi';
import { LoncengNotifikasi, PemilihTahapan, PencarianCepat, TombolTema } from '@/components/klien';
import { Kerangka } from './kerangka';

export const dynamic = 'force-dynamic';


export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  // sesi dan daftar tahapan dibaca bersamaan; halaman memakai hasil yang sama (cache per permintaan)
  const [user, semua, aktif] = await Promise.all([wajibSesi(), semuaTahapan(), tahapanAktif()]);
  const notif = aktif ? await hitungNotifikasiTerbuka(user, String(aktif._id)) : { total: 0, kritis: 0 };
  const opsi = semua.map((t) => ({ _id: String(t._id), nama: t.nama, tahun: t.tahun, status: t.status }));
  const menu = {
    rekap: user.peran !== 'skpd',
    perbedaan: boleh(user, 'lihat_perbedaan'),
    master: user.peran !== 'skpd',
    tahapan: boleh(user, 'kelola_tahapan'),
    pengguna: boleh(user, 'kelola_pengguna'),
    audit: boleh(user, 'lihat_audit'),
  };
  return (
    <Kerangka
      menu={menu}
      pengguna={{ nama: user.nama, peran: LABEL_PERAN[user.peran] }}
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
