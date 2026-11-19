import type { Metadata } from 'next';
import Link from 'next/link';
import { daftarMasterHibah } from '@danboy/core/services';
import { TabelMaster } from '@/components/hibah';
import { Kartu, KepalaHalaman } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';
import { ImporHibah } from '../riwayat/impor';

export const metadata: Metadata = { title: 'Wilayah' };

export default async function HalamanWilayah({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_kelola_master', searchParams);
  const kec = (await daftarMasterHibah(user, 'kecamatan')) as Data[];
  const pilih: string | undefined = kec.find((k) => k.kode === sp.kecamatan)?.kode ?? kec[0]?.kode;
  const desa = pilih ? ((await daftarMasterHibah(user, 'desa', { kecamatan: pilih })) as Data[]) : [];
  return (
    <>
      <KepalaHalaman judul="Wilayah" sub="Kecamatan dan kelurahan/desa untuk alamat calon penerima dan pencocokan impor riwayat." aksi={<ImporHibah jenis="wilayah" />} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Kartu judul={`Kecamatan (${kec.length})`} padat>
          <TabelMaster
            jenis="kecamatan"
            judul="Kecamatan"
            data={kec}
            kolom={[
              { key: 'kode', label: 'Kode', wajib: true, kunci: true },
              { key: 'nama', label: 'Nama', wajib: true },
              { key: 'aktif', label: 'Aktif', tipe: 'bool' },
            ]}
          />
          <div className="flex flex-wrap gap-1 border-t border-garis p-3">
            <span className="mr-1 self-center text-xs text-redup">Lihat desa:</span>
            {kec.map((k) => (
              <Link key={k.kode} href={`?kecamatan=${k.kode}`} className={`rounded px-2 py-1 text-xs ${k.kode === pilih ? 'bg-utama-lembut font-medium text-utama' : 'text-redup hover:bg-latar'}`}>
                {k.nama}
              </Link>
            ))}
          </div>
        </Kartu>
        <Kartu judul={`Kelurahan/desa di ${kec.find((k) => k.kode === pilih)?.nama ?? '–'} (${desa.length})`} padat>
          <TabelMaster
            jenis="desa"
            judul="Kelurahan/desa"
            bisaUbah={!!pilih}
            data={desa}
            kolom={[
              { key: 'kode', label: 'Kode', wajib: true, kunci: true },
              { key: 'nama', label: 'Nama', wajib: true },
              { key: 'jenis', label: 'Jenis', tipe: 'pilihan', wajib: true, bawaan: 'desa', opsi: [{ nilai: 'desa', label: 'Desa' }, { nilai: 'kelurahan', label: 'Kelurahan' }] },
              { key: 'kecamatanKode', label: 'Kecamatan', tipe: 'pilihan', wajib: true, bawaan: pilih, opsi: kec.map((k) => ({ nilai: k.kode, label: k.nama })), tabel: false },
              { key: 'aktif', label: 'Aktif', tipe: 'bool' },
            ]}
          />
        </Kartu>
      </div>
    </>
  );
}
