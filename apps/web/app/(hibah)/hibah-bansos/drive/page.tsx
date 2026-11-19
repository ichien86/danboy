import type { Metadata } from 'next';
import { statusDrive } from '@danboy/core/services';
import { TombolAksi } from '@/components/hibah';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Lencana, Peringatan, Statistik, TautanTombol } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Google Drive' };

const gb = (n: number | null | undefined) => (n == null ? '–' : `${(n / 1024 ** 3).toLocaleString('id-ID', { maximumFractionDigits: 2 })} GB`);

export default async function HalamanDrive({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_kelola_drive', searchParams);
  const d = (await statusDrive(user, sp.segarkan === '1')) as Data;
  return (
    <>
      <KepalaHalaman
        judul="Google Drive"
        sub="Berkas usulan disimpan di Drive akun Gmail khusus aplikasi (cakupan drive.file). Berkas tidak pernah dibagikan publik dan dibuka lewat modul."
        aksi={
          d.terhubung ? (
            <TombolAksi url="/api/hibah/drive" method="DELETE" label="Putuskan" varian="bahaya" kecil={false} konfirmasi="Putuskan Google Drive? Unggahan baru akan menunggu di server sampai Drive dihubungkan lagi." berhasil="Drive diputuskan" />
          ) : (
            <TautanTombol href="/api/hibah/drive/mulai" varian="utama">
              Hubungkan Google Drive
            </TautanTombol>
          )
        }
      />
      {sp.ok && <Peringatan nada="aman">Google Drive terhubung.</Peringatan>}
      {sp.galat && <Peringatan nada="bahaya">{sp.galat}</Peringatan>}
      {!d.konfigurasiLengkap && (
        <Peringatan nada="waspada" judul="Konfigurasi OAuth belum lengkap">
          Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI (…/api/hibah/drive/oauth/callback) di pengaturan server. Aplikasi OAuth harus berstatus In production; pada status Testing token kedaluwarsa setelah 7 hari.
        </Peringatan>
      )}
      {!d.kunciLengkap && (
        <Peringatan nada="bahaya" judul="Kunci enkripsi belum diatur">
          KUNCI_ENKRIPSI dan KUNCI_SIDIK wajib diatur sebelum data penerima disimpan. Jalankan pnpm hibah:seed --kunci untuk membuatnya.
        </Peringatan>
      )}
      {d.status === 'putus' && (
        <Peringatan nada="bahaya" judul="Koneksi terputus">
          Token Google tidak berlaku lagi. Unggahan tetap diterima dan menunggu di server; hubungkan ulang agar terkirim ke Drive.
        </Peringatan>
      )}
      {d.kuotaMenipis && <Peringatan nada="waspada" judul="Kuota Drive menipis">Sisa kuota di bawah 10%. Kuota gratis 15 GB dipakai bersama Gmail dan Google Photos.</Peringatan>}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-garis bg-permukaan p-4">
          <p className="text-xs font-medium text-redup">Status</p>
          <div className="mt-2">
            <Lencana nada={d.terhubung ? 'aman' : 'bahaya'}>{d.terhubung ? 'Terhubung' : d.status === 'putus' ? 'Terputus' : 'Belum terhubung'}</Lencana>
          </div>
          {d.email && <p className="mt-1 truncate text-xs text-redup">{d.email}</p>}
        </div>
        <Statistik label="Sisa kuota" nilai={d.sisaPersen == null ? '–' : `${d.sisaPersen.toLocaleString('id-ID')}%`} sub={`${gb(d.kuota?.dipakai)} dari ${gb(d.kuota?.total)} · ${tanggal(d.kuota?.diperbarui, true)}`} nada={d.kuotaMenipis ? 'waspada' : undefined} />
        <Statistik label="Berkas tersimpan" nilai={(d.berkas?.tersimpan ?? 0).toLocaleString('id-ID')} />
        <Statistik label="Menunggu / gagal" nilai={`${d.berkas?.menunggu ?? 0} / ${d.berkas?.gagal ?? 0}`} nada={d.berkas?.gagal ? 'bahaya' : undefined} sub="dikirim ulang otomatis setiap 5 menit" />
      </div>
      <Kartu className="mt-4" judul="Tindakan">
        <div className="flex flex-wrap gap-2">
          <TautanTombol href="?segarkan=1">Segarkan kuota</TautanTombol>
          <TombolAksi url="/api/hibah/berkas/ulangi" label="Kirim ulang berkas tertunda dan gagal" kecil={false} berhasil="Pengiriman ulang dijalankan" />
        </div>
        <p className="mt-3 text-sm text-redup">Struktur folder: Verifikasi TAPD / TA / Perangkat Daerah / Nama Penerima, ditambah folder Rekomendasi dan Berita Acara per tahun anggaran.</p>
      </Kartu>
    </>
  );
}
