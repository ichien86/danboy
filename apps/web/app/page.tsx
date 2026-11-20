import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, HandCoins, Wallet } from 'lucide-react';
import { LABEL_PERAN, LABEL_PERAN_HIBAH, modulDiizinkan, peranHibah, type Modul } from '@danboy/core';
import { ambilJadwal, tahunAktifAtauNull } from '@danboy/core/services';
import { TombolKeluar } from '@/components/kerangka';
import { TombolTema } from '@/components/klien';
import { Lencana } from '@/components/ui';
import { COOKIE_MODUL } from '@/lib/cookie-modul';
import { MODUL } from '@/lib/menu';
import { semuaTahapan, wajibSesi } from '@/lib/sesi';

export const metadata: Metadata = { title: 'Beranda' };
export const dynamic = 'force-dynamic';

const IKON: Record<Modul, typeof Wallet> = { danboy: Wallet, hibah: HandCoins };
const KETERANGAN: Record<Modul, string> = {
  danboy: 'Pemantauan sumber dana APBD per tahapan: pagu dan alokasi subkegiatan, rekap sumber dana, matriks, dan verifikasi input SIPD.',
  hibah: 'Usulan hibah dan bantuan sosial dari Perangkat Daerah, evaluasi dan dokumen rekomendasi, verifikasi TAPD, sampai Berita Acara.',
};

/** Landing page setelah masuk: pilih modul Pendanaan atau Hibah dan Bansos. */
export default async function Beranda() {
  const user = await wajibSesi();
  const modul = modulDiizinkan(user);
  const terakhir = (await cookies()).get(COOKIE_MODUL)?.value;

  // ringkasan singkat per modul; galat di satu modul tidak menghalangi landing page
  const info: Partial<Record<Modul, string>> = {};
  if (modul.includes('danboy')) {
    const t = await semuaTahapan().catch(() => []);
    const buka = t.find((x) => x.status === 'terbuka');
    info.danboy = buka ? `Tahapan terbuka: ${buka.nama}` : t[0] ? `Tahapan terakhir: ${t[0].nama}` : 'Belum ada tahapan';
  }
  if (modul.includes('hibah')) {
    const t = await tahunAktifAtauNull().catch(() => null);
    if (!t) info.hibah = 'Belum ada tahun anggaran aktif';
    else {
      const j = (await ambilJadwal(user, t.tahun).catch(() => [])) as { label: string; berjalan: boolean; sisaHari: number | null }[];
      const b = j.find((x) => x.berjalan);
      info.hibah = `TA ${t.tahun} · ${b ? `${b.label}${b.sisaHari !== null && b.sisaHari > 0 ? `, sisa ${b.sisaHari} hari` : ''}` : 'tidak ada tahapan berjalan'}`;
    }
  }
  const peran: Record<Modul, string> = {
    danboy: user.peran ? LABEL_PERAN[user.peran] : '',
    hibah: peranHibah(user) ? LABEL_PERAN_HIBAH[peranHibah(user)!] : '',
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-garis bg-permukaan">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <img src="/icon.svg" alt="" className="size-8" />
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-wide">DANBOY</p>
            <p className="text-[11px] text-redup">Pemerintah Kabupaten Boyolali</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-right text-sm sm:block">
              <span className="block font-medium">{user.nama}</span>
            </span>
            <TombolTema />
            <TombolKeluar />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Selamat datang, {user.nama}</h1>
        <p className="mt-1 text-redup">Pilih modul yang akan dibuka.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {modul.map((m) => {
            const Ikon = IKON[m];
            return (
              <Link
                key={m}
                href={MODUL[m].href}
                className="group flex flex-col rounded-xl border border-garis bg-permukaan p-6 transition hover:border-utama hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-utama"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-utama-lembut p-2.5 text-utama">
                    <Ikon className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{MODUL[m].nama}</h2>
                    <p className="text-sm text-redup">{MODUL[m].sub}</p>
                  </div>
                  {terakhir === m && <Lencana nada="info">terakhir dibuka</Lencana>}
                </div>
                <p className="mt-4 text-sm">{KETERANGAN[m]}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  {peran[m] && <Lencana>{peran[m]}</Lencana>}
                  {info[m] && <span className="text-redup">{info[m]}</span>}
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-utama">
                  Buka {MODUL[m].nama} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
        {!modul.length && <p className="mt-6 text-sm text-redup">Akun Anda belum diberi akses ke modul mana pun. Hubungi Super Admin.</p>}
      </main>
    </div>
  );
}
