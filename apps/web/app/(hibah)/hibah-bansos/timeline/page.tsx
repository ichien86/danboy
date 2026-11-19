import type { Metadata } from 'next';
import { ambilJadwal, tahunAktifAtauNull } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Timeline' };

/** Garis waktu lima tahapan sesuai skala tanggal, penanda hari ini, dan sisa hari tahapan berjalan (FR-40). */
export default async function HalamanTimeline() {
  const { user } = await halamanHibah('hibah_lihat_rekap');
  const t = await tahunAktifAtauNull();
  if (!t) return <Kartu><Kosong judul="Belum ada tahun anggaran aktif" /></Kartu>;
  const j = (await ambilJadwal(user, t.tahun)) as Data[];
  const ada = j.filter((x) => x.mulai && x.selesai);
  if (!ada.length) {
    return (
      <>
        <KepalaHalaman judul="Timeline" />
        <Kartu>
          <Kosong judul="Jadwal belum diisi">Admin Perencana mengisi jadwal lima tahapan di menu Tahun dan Jadwal.</Kosong>
        </Kartu>
      </>
    );
  }
  const hari = 86_400_000;
  const awal = Math.min(...ada.map((x) => +new Date(x.mulai))) - hari;
  const akhir = Math.max(...ada.map((x) => +new Date(x.selesai))) + 2 * hari;
  const kini = Date.now();
  const posisi = (d: number) => `${Math.min(100, Math.max(0, ((d - awal) / (akhir - awal)) * 100))}%`;
  const berjalan = j.find((x) => x.berjalan);
  return (
    <>
      <KepalaHalaman
        judul="Timeline"
        sub={
          berjalan
            ? `Tahapan berjalan: ${berjalan.label}, ${berjalan.sisaHari > 0 ? `sisa ${berjalan.sisaHari} hari` : 'berakhir hari ini'}.`
            : `Tidak ada tahapan yang sedang berjalan hari ini (TA ${t.tahun}).`
        }
      />
      <Kartu>
        <div className="relative space-y-4 py-6">
          <div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-utama" style={{ left: `calc(12rem + (100% - 12rem) * ${(Math.min(Math.max(kini, awal), akhir) - awal) / (akhir - awal)})` }}>
            <span className="absolute -top-1 left-1 whitespace-nowrap text-xs font-medium text-utama">Hari ini</span>
          </div>
          {j.map((x) => (
            <div key={x.tahapan} className="grid grid-cols-[12rem_1fr] items-center gap-0">
              <div className="pr-3 text-sm">
                <p className={x.berjalan ? 'font-semibold' : ''}>{x.label}</p>
                {x.berjalan && <Lencana nada="aman">berjalan</Lencana>}
                {x.perpanjangan.length > 0 && <p className="text-xs text-redup">{x.perpanjangan.length} PD diperpanjang</p>}
              </div>
              <div className="relative h-8 rounded bg-latar">
                {x.mulai && x.selesai ? (
                  <div
                    className={`absolute inset-y-1 rounded ${x.berjalan ? 'bg-utama' : +new Date(x.selesai) < kini ? 'bg-redup/40' : 'bg-utama/40'}`}
                    style={{ left: posisi(+new Date(x.mulai)), width: `calc(${posisi(+new Date(x.selesai) + hari)} - ${posisi(+new Date(x.mulai))})` }}
                    title={`${tanggal(x.mulai)} – ${tanggal(x.selesai)}`}
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center px-2 text-xs text-redup">belum dijadwalkan</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-2 grid gap-1 border-t border-garis pt-3 text-sm sm:grid-cols-2">
          {j.map((x) => (
            <li key={x.tahapan}>
              <span className="font-medium">{x.label}</span>: <span className="text-redup">{x.mulai ? `${tanggal(x.mulai)} – ${tanggal(x.selesai)}` : 'belum dijadwalkan'}</span>
            </li>
          ))}
        </ul>
      </Kartu>
    </>
  );
}
