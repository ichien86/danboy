import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { daftarTahapan, daftarTahun } from '@danboy/core/services';
import { StatusTahapan, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Peringatan, Tabel, TD, TH } from '@/components/ui';
import { wajibSesi } from '@/lib/sesi';
import { AksiTahapan, FormTahapan, FormTahun } from './form';

export const metadata: Metadata = { title: 'Tahun & Tahapan' };

interface T {
  _id: string;
  tahun: number;
  nama: string;
  jenis: string;
  status: string;
  jadwalMulai: string;
  jadwalSelesai: string;
  disalinDari?: string | null;
  disalinPada?: string | null;
  galatSalin?: string | null;
}

export default async function PengaturanTahapan() {
  const user = await wajibSesi();
  if (!boleh(user, 'kelola_tahapan')) redirect('/dasbor');
  const [tahun, tahapan] = await Promise.all([daftarTahun(), daftarTahapan()]);
  const semua = tahapan as unknown as T[];
  const namaPer = new Map(semua.map((t) => [String(t._id), t.nama]));
  const daftarTahunAngka = [...new Set([...(tahun as { tahun: number }[]).map((t) => t.tahun), ...semua.map((t) => t.tahun)])].sort((a, b) => b - a);

  return (
    <>
      <KepalaHalaman
        judul="Tahun anggaran & tahapan"
        sub="Tahapan dibuka otomatis saat jadwal mulai tiba (data tahapan sebelumnya disalin), dan ditutup saat jadwal selesai lewat."
        aksi={
          <>
            <FormTahun />
            <FormTahapan />
          </>
        }
      />
      {daftarTahunAngka.length ? (
        <div className="space-y-4">
          {daftarTahunAngka.map((th) => {
            const baris = semua.filter((t) => t.tahun === th);
            return (
              <Kartu key={th} judul={`Tahun ${th}`} padat>
                {baris.length ? (
                  <Tabel>
                    <thead>
                      <tr>
                        <TH>Tahapan</TH>
                        <TH>Jadwal</TH>
                        <TH>Status</TH>
                        <TH>Salinan</TH>
                        <TH />
                      </tr>
                    </thead>
                    <tbody>
                      {baris.map((t) => (
                        <tr key={t._id}>
                          <TD className="font-medium">{t.nama}</TD>
                          <TD className="whitespace-nowrap text-redup">
                            {tanggal(t.jadwalMulai, true)} – {tanggal(t.jadwalSelesai, true)}
                          </TD>
                          <TD>
                            <StatusTahapan status={t.status} />
                          </TD>
                          <TD className="text-redup">
                            {t.disalinDari ? `dari ${namaPer.get(String(t.disalinDari)) ?? '?'} (${tanggal(t.disalinPada)})` : t.status === 'draf' ? 'saat dibuka' : '–'}
                            {t.galatSalin && (
                              <div className="mt-1">
                                <Peringatan nada="bahaya">Salin gagal: {t.galatSalin}</Peringatan>
                              </div>
                            )}
                          </TD>
                          <TD>
                            <AksiTahapan t={{ _id: String(t._id), nama: t.nama, status: t.status, jadwalMulai: t.jadwalMulai, jadwalSelesai: t.jadwalSelesai }} />
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </Tabel>
                ) : (
                  <Kosong judul="Belum ada tahapan di tahun ini" />
                )}
              </Kartu>
            );
          })}
        </div>
      ) : (
        <Kartu>
          <Kosong judul="Belum ada tahun anggaran">Tambah tahun lalu buat tahapan KUA-PPAS, RAPBD, APBD, Pergeseran, atau Perubahan.</Kosong>
        </Kartu>
      )}
    </>
  );
}
