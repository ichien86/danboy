import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { batasUnggahMb, daftarImpor } from '@danboy/core/services';
import { StatusBatch, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Paginasi, Tabel, TD, TH } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';
import { FormUnggah } from './unggah';

export const metadata: Metadata = { title: 'Impor' };

const LABEL_JENIS: Record<string, string> = {
  apbd: 'Rincian APBD (SIPD)',
  nomenklatur: 'Nomenklatur',
  sumber_dana: 'Sumber dana',
  rekening: 'Rekening',
  tagging: 'Tagging',
  verifikasi: 'Verifikasi SIPD',
};

export default async function Impor({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!boleh(user, 'impor')) redirect('/dasbor');
  const page = num(sp.page, 1);
  const r = await daftarImpor(user, { jenis: sp.jenis, page, limit: 20 });

  return (
    <>
      <KepalaHalaman judul="Impor" sub="Unggah file → pratinjau perubahan → terapkan. Data tidak berubah sebelum pratinjau disetujui." />
      <div className="grid gap-4 xl:grid-cols-[26rem_1fr]">
        <Kartu judul="Unggah file">
          <FormUnggah
            tahapan={tahapan ? { _id: String(tahapan._id), nama: tahapan.nama, status: tahapan.status, tahun: tahapan.tahun } : null}
            batasMb={batasUnggahMb()}
          />
        </Kartu>
        <Kartu judul="Riwayat impor" padat>
          {r.data.length ? (
            <>
              <Tabel>
                <thead>
                  <tr>
                    <TH>File</TH>
                    <TH>Jenis</TH>
                    <TH>Status</TH>
                    <TH>Oleh</TH>
                    <TH>Waktu</TH>
                  </tr>
                </thead>
                <tbody>
                  {(r.data as unknown as { _id: string; namaFile: string; jenis: string; status: string; olehId?: { nama: string }; createdAt: string; tahapanId?: { nama: string } }[]).map((b) => (
                    <tr key={b._id} className="hover:bg-latar/60">
                      <TD>
                        <Link href={b.jenis === 'verifikasi' ? `/verifikasi/${b._id}` : `/impor/${b._id}`} className="font-medium hover:underline">
                          {b.namaFile}
                        </Link>
                        {b.tahapanId && <span className="block text-xs text-redup">{b.tahapanId.nama}</span>}
                      </TD>
                      <TD>{LABEL_JENIS[b.jenis] ?? b.jenis}</TD>
                      <TD>
                        <StatusBatch status={b.status} />
                      </TD>
                      <TD className="text-redup">{b.olehId?.nama}</TD>
                      <TD className="whitespace-nowrap text-redup">{tanggal(b.createdAt, true)}</TD>
                    </tr>
                  ))}
                </tbody>
              </Tabel>
              <Paginasi total={r.total} page={page} limit={20} dasar="/impor" param={{ jenis: sp.jenis }} />
            </>
          ) : (
            <Kosong judul="Belum ada impor">Mulai dengan master sumber dana dan nomenklatur, lalu rincian APBD dari SIPD.</Kosong>
          )}
        </Kartu>
      </div>
    </>
  );
}
