import type { Metadata } from 'next';
import { detailPenerima, opsiHibah } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';
import { FormUsulan } from '../form';

export const metadata: Metadata = { title: 'Usulan baru' };

export default async function UsulanBaru({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_input_usulan', searchParams);
  const [opsi, penerima] = await Promise.all([opsiHibah(user), sp.penerima ? detailPenerima(user, sp.penerima).catch(() => null) : Promise.resolve(null)]);
  return (
    <>
      <KepalaHalaman judul="Usulan baru" sub="Pilih calon penerima, isi data usulan dan rincian aktivitas. Nilai usulan dihitung otomatis dari rincian." />
      <Kartu>
        <Kosong judul={penerima ? `Usulan untuk ${(penerima as Data).nama}` : 'Mulai dari calon penerima'}>
          <p>Kartu penerima harus sudah ada. Satu penerima boleh punya lebih dari satu usulan dalam setahun; modul akan menampilkan peringatan.</p>
          <div className="mt-4">
            <FormUsulan opsi={opsi as Data as { jenis: Data[]; tujuan: Data[]; rekening: Data[] }} penerima={penerima as Data | null} bukaAwal tombol="Isi formulir usulan" />
          </div>
        </Kosong>
      </Kartu>
    </>
  );
}
