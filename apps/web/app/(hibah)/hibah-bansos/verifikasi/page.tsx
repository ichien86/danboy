import type { Metadata } from 'next';
import type { SP } from '@/lib/hibah';
import { DaftarUsulanHalaman } from '../usulan/daftar';

export const metadata: Metadata = { title: 'Verifikasi TAPD' };

/** Antrean verifikasi TAPD (FR-29): usulan yang rekomendasinya sudah diunggah, dari semua PD. */
export default async function HalamanVerifikasi({ searchParams }: { searchParams: SP }) {
  return (
    <DaftarUsulanHalaman
      searchParams={searchParams}
      judul="Verifikasi TAPD"
      sub="Usulan dengan rekomendasi PD yang sudah diunggah; buka usulan untuk menilai empat aspek dan menetapkan keputusan."
      statusBawaan="rekomendasi_diunggah"
      dasar="/hibah-bansos/verifikasi"
      aksi="hibah_verifikasi"
    />
  );
}
