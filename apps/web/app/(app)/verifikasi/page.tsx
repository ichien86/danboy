import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { batasUnggahMb, daftarVerifikasi } from '@danboy/core/services';
import { StatusBatch, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Paginasi, Peringatan, Tabel, TD, TH } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';
import { FormVerifikasi } from './form';
import { angka } from '@/lib/angka';

export const metadata: Metadata = { title: 'Verifikasi SIPD' };

interface Batch {
  _id: string;
  namaFile: string;
  judul?: string | null;
  status: string;
  createdAt: string;
  galat?: string | null;
  olehId?: { nama: string };
  ringkasan: { jumlah?: number; sesuai?: number; tidakSesuai?: number; perSkpd?: { tidakSesuai: number; jumlah: number }[] };
}

export default async function Verifikasi({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const page = num(sp.page, 1);
  const r = await daftarVerifikasi(user, String(tahapan._id), { page, limit: 20 });
  const bolehUnggah = boleh(user, 'impor');
  const skpd = user.peran === 'skpd';

  return (
    <>
      <KepalaHalaman
        judul="Verifikasi input SIPD"
        sub={`Acuan: alokasi sumber dana di aplikasi pada ${tahapan.nama}`}
      />
      <div className="mb-4">
        <Peringatan nada="info">
          Unggah ekspor rincian APBD dari SIPD untuk mengecek apakah sumber dana yang diinput SKPD di SIPD sudah sama dengan alokasi di aplikasi.
          Verifikasi <b>tidak mengubah data apa pun</b>. Hasilnya bisa diunduh per SKPD, dan setiap SKPD yang belum sesuai mendapat notifikasi.
          Hanya hasil verifikasi terbaru yang disimpan.
        </Peringatan>
      </div>
      <div className={bolehUnggah ? 'grid gap-4 xl:grid-cols-[24rem_1fr]' : ''}>
        {bolehUnggah && (
          <Kartu judul="Cek file SIPD">
            <FormVerifikasi tahapanId={String(tahapan._id)} namaTahapan={tahapan.nama} batasMb={batasUnggahMb()} />
          </Kartu>
        )}
        <Kartu judul="Hasil verifikasi" padat>
          {r.data.length ? (
            <>
              <Tabel>
                <thead>
                  <tr>
                    <TH>Judul</TH>
                    <TH>Hasil</TH>
                    <TH>Status</TH>
                    <TH>Waktu</TH>
                  </tr>
                </thead>
                <tbody>
                  {(r.data as unknown as Batch[]).map((b) => {
                    const milik = skpd ? b.ringkasan.perSkpd?.[0] : undefined;
                    const tidakSesuai = skpd ? milik?.tidakSesuai : b.ringkasan.tidakSesuai;
                    const jumlah = skpd ? milik?.jumlah : b.ringkasan.jumlah;
                    return (
                      <tr key={b._id} className="hover:bg-latar/60">
                        <TD>
                          <Link href={`/verifikasi/${b._id}`} className="font-medium hover:underline">
                            {b.judul || b.namaFile}
                          </Link>
                          <span className="block text-xs text-redup">
                            {b.judul ? `${b.namaFile}` : ''}
                            {b.judul && b.olehId ? ' · ' : ''}
                            {b.olehId ? `oleh ${b.olehId.nama}` : ''}
                          </span>
                        </TD>
                        <TD>
                          {b.status === 'selesai' ? (
                            jumlah === undefined ? (
                              <span className="text-redup">Tidak ada data SKPD Anda di file ini</span>
                            ) : tidakSesuai ? (
                              <Lencana nada="waspada">
                                {angka(tidakSesuai)} dari {angka(jumlah)} subkegiatan belum sesuai
                              </Lencana>
                            ) : (
                              <Lencana nada="aman">Semua {angka(jumlah)} subkegiatan sesuai</Lencana>
                            )
                          ) : b.status === 'gagal' ? (
                            <span className="text-xs text-bahaya">{b.galat}</span>
                          ) : (
                            <span className="text-redup">Sedang diperiksa…</span>
                          )}
                        </TD>
                        <TD>
                          <StatusBatch status={b.status} />
                        </TD>
                        <TD className="whitespace-nowrap text-redup">{tanggal(b.createdAt, true)}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabel>
              <Paginasi total={r.total} page={page} limit={20} dasar="/verifikasi" param={{}} />
            </>
          ) : (
            <Kosong judul="Belum ada verifikasi untuk tahapan ini">{bolehUnggah ? 'Unggah file ekspor SIPD di sebelah kiri.' : 'Admin belum menjalankan verifikasi.'}</Kosong>
          )}
        </Kartu>
      </div>
    </>
  );
}
