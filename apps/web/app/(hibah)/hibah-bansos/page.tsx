import type { Metadata } from 'next';
import Link from 'next/link';
import { LABEL_PERAN_HIBAH, peranHibah, type PeranHibah } from '@danboy/core';
import { Kartu, KepalaHalaman, Lencana, Peringatan } from '@/components/ui';
import { wajibSesi } from '@/lib/sesi';
import { MENU_HIBAH } from '@/lib/menu';

export const metadata: Metadata = { title: 'Hibah dan Bansos' };

/** Ringkasan tugas tiap peran (Rencana Pengembangan, bagian Peran dan Hak Akses). */
const TUGAS: Record<PeranHibah, string> = {
  admin_perencana:
    'Mengelola tahun anggaran dan jadwal, master data, wilayah, templat dokumen, riwayat penerima, koneksi Google Drive, serta membuka kunci hasil verifikasi.',
  operator_pd:
    'Mencatat calon penerima dan usulan hibah atau bansos Perangkat Daerah Anda, mengisi evaluasi, dan mengunggah dokumen rekomendasi yang sudah ditandatangani.',
  verifikator: 'Memverifikasi usulan dari semua Perangkat Daerah pada empat aspek, menetapkan nilai disetujui, mengunci hasil, dan mencetak Berita Acara.',
  anggota: 'Melihat timeline, progres per Perangkat Daerah, rekap, dan Berita Acara.',
};

/** Fase yang sedang dibangun; menu dari fase sesudahnya ditandai belum tersedia. */
const FASE_SELESAI = 1;

export default async function DashboardHibah() {
  const user = await wajibSesi();
  const peran = peranHibah(user)!;
  const fitur = MENU_HIBAH.flatMap((g) => g.butir.filter((b) => b.fase > 1 && b.peran.includes(peran)).map((b) => ({ ...b, grup: g.judul })));

  return (
    <>
      <KepalaHalaman judul="Dashboard Hibah dan Bansos" sub={`${user.nama} · ${LABEL_PERAN_HIBAH[peran]}`} />
      <Peringatan nada="info" judul="Modul sedang dibangun bertahap">
        Fondasi modul sudah aktif: akun, peran, dan menu. Fitur lain dibuka per fase sesuai rencana pengembangan, dimulai dari master data dan jadwal.
      </Peringatan>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Kartu judul="Peran Anda di modul ini">
          <p className="text-sm font-medium">{LABEL_PERAN_HIBAH[peran]}</p>
          <p className="mt-1 text-sm text-redup">{TUGAS[peran]}</p>
        </Kartu>
        <Kartu judul="Fitur untuk peran Anda" padat>
          <ul className="divide-y divide-garis">
            {fitur.map((b) => (
              <li key={b.href} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link href={b.href} className="min-w-0 flex-1 hover:underline">
                  {b.label}
                  {b.grup && <span className="ml-2 text-xs text-redup">{b.grup}</span>}
                </Link>
                {b.fase <= FASE_SELESAI ? <Lencana nada="aman">Tersedia</Lencana> : <Lencana>Fase {b.fase}</Lencana>}
              </li>
            ))}
          </ul>
        </Kartu>
      </div>
    </>
  );
}
