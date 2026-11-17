import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { daftarBidangUrusan, daftarSkpd, daftarSumberDana } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Peringatan, TautanTombol } from '@/components/ui';
import { konteksHalaman, TanpaTahapan, type SP } from '@/lib/halaman';
import { FormTambahSubkegiatan } from './form';

export const metadata: Metadata = { title: 'Tambah subkegiatan' };

export default async function HalamanTambahSubkegiatan({ searchParams }: { searchParams: SP }) {
  const { user, tahapan } = await konteksHalaman(searchParams);
  if (!boleh(user, 'impor')) redirect('/subkegiatan'); // hanya Admin; akun SKPD tidak bisa menambah subkegiatan
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const [skpd, sd, bidang] = await Promise.all([daftarSkpd(user), daftarSumberDana(user), daftarBidangUrusan(user)]);
  return (
    <>
      <KepalaHalaman judul="Tambah subkegiatan" sub={tahapan.nama} aksi={<TautanTombol href="/subkegiatan">Kembali</TautanTombol>} />
      {tahapan.status !== 'terbuka' ? (
        <Peringatan nada="waspada">Tahapan {tahapan.nama} tidak terbuka; subkegiatan tidak bisa ditambahkan (R10).</Peringatan>
      ) : (
        <Kartu className="max-w-3xl">
          <FormTambahSubkegiatan
            tahapanId={String(tahapan._id)}
            skpd={(skpd as unknown as { _id: string; kode: string; nama: string; subUnit: { _id: string; nama: string }[] }[]).map((s) => ({
              id: s._id,
              kode: s.kode,
              nama: s.nama,
              subUnit: s.subUnit.map((u) => ({ id: u._id, nama: u.nama })),
            }))}
            sumberDana={(sd as unknown as { _id: string; nama: string }[]).map((s) => ({ id: s._id, nama: s.nama }))}
            bidang={bidang}
          />
        </Kartu>
      )}
    </>
  );
}
