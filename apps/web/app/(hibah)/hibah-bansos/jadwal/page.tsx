import type { Metadata } from 'next';
import { ambilJadwal, daftarTahunHibah, skpdSemua } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Lencana } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';
import { FormDasarHukum, FormJadwal, FormPerpanjangan, FormTahunBaru, TombolAktifkan } from './form';

export const metadata: Metadata = { title: 'Tahun dan Jadwal' };

export default async function HalamanJadwal({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_kelola_tahun', searchParams);
  const daftar = (await daftarTahunHibah(user)) as Data[];
  const aktif = daftar.find((t) => t.aktif);
  const tahun = Number(sp.tahun) || aktif?.tahun || daftar[0]?.tahun;
  const t = daftar.find((x) => x.tahun === tahun);
  const [jadwal, skpd] = t ? await Promise.all([ambilJadwal(user, tahun), skpdSemua()]) : [[], []];
  return (
    <>
      <KepalaHalaman judul="Tahun dan Jadwal" sub="Tahun anggaran, lima tahapan, dan perpanjangan per Perangkat Daerah. Tanggal yang sudah lewat boleh diisi." aksi={<FormTahunBaru />} />
      {!daftar.length ? (
        <Kartu>
          <Kosong judul="Belum ada tahun anggaran">Tambahkan tahun anggaran, misalnya 2027. Tahun pertama otomatis menjadi tahun aktif.</Kosong>
        </Kartu>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {daftar.map((x) => (
              <a
                key={x.tahun}
                href={`?tahun=${x.tahun}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${x.tahun === tahun ? 'border-utama bg-utama-lembut font-medium text-utama' : 'border-garis hover:bg-latar'}`}
              >
                TA {x.tahun} {x.aktif && <Lencana nada="aman">aktif</Lencana>}
              </a>
            ))}
            {t && !t.aktif && <TombolAktifkan tahun={tahun} />}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Kartu judul={`Jadwal tahapan TA ${tahun}`}>
              <FormJadwal tahun={tahun} jadwal={jadwal as Data[]} />
            </Kartu>
            <Kartu judul="Perpanjangan per Perangkat Daerah">
              <FormPerpanjangan tahun={tahun} jadwal={jadwal as Data[]} skpd={(skpd as Data[]).map((s) => ({ _id: s._id, nama: s.nama }))} />
            </Kartu>
            <Kartu judul="Dasar hukum Berita Acara" className="xl:col-span-2">
              <FormDasarHukum tahun={tahun} awal={t?.dasarHukum ?? []} />
            </Kartu>
          </div>
        </>
      )}
    </>
  );
}
