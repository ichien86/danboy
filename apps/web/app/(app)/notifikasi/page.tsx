import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { daftarNotifikasi } from '@danboy/core/services';
import { LABEL_ATURAN, PENJELASAN_ATURAN, TingkatNotifikasi, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Paginasi, TautanTombol } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';
import { TombolAbaikan } from './abaikan';

export const metadata: Metadata = { title: 'Notifikasi' };

export default async function Notifikasi({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const status = (sp.status as 'terbuka' | 'selesai' | 'diabaikan') || 'terbuka';
  const page = num(sp.page, 1);
  const r = await daftarNotifikasi(user, { tahapanId: String(tahapan._id), status, aturan: sp.aturan, page, limit: 50 });
  const bolehAksi = boleh(user, 'ubah_alokasi');
  const tautan = (o: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ status, aturan: sp.aturan, ...o }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <KepalaHalaman
        judul="Notifikasi"
        sub={`${tahapan.nama}${user.peran === 'skpd' ? ' · notifikasi untuk SKPD Anda' : ''}`}
        aksi={<TautanTombol href={`/api/ekspor/notifikasi?tahapanId=${tahapan._id}`}>Unduh Excel</TautanTombol>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        {(['terbuka', 'selesai', 'diabaikan'] as const).map((s) => (
          <Link key={s} href={tautan({ status: s, aturan: undefined })} className={`rounded-full border px-3 py-1 capitalize ${status === s ? 'border-utama bg-utama-lembut font-medium text-utama' : 'border-garis bg-permukaan text-redup hover:text-teks'}`}>
            {s}
          </Link>
        ))}
        <span className="mx-1 text-garis">|</span>
        {['', 'VS', 'R2', 'R3', 'R4', 'R5', 'R8', 'R9', 'PD'].map((a) => (
          <Link key={a} href={tautan({ aturan: a || undefined })} className={`rounded-full border px-2.5 py-1 text-xs ${(sp.aturan ?? '') === a ? 'border-utama bg-utama-lembut font-medium text-utama' : 'border-garis bg-permukaan text-redup hover:text-teks'}`} title={a ? PENJELASAN_ATURAN[a] : undefined}>
            {a ? LABEL_ATURAN[a] : 'Semua jenis'}
          </Link>
        ))}
      </div>
      {sp.aturan && PENJELASAN_ATURAN[sp.aturan] && <p className="mb-3 text-sm text-redup">{PENJELASAN_ATURAN[sp.aturan]}</p>}
      <Kartu padat>
        {r.data.length ? (
          <>
            <ul className="divide-y divide-garis">
              {(r.data as { _id: string; aturan: string; tingkat: 'kritis' | 'peringatan' | 'info'; pesan: string; tautan?: string; createdAt: string; skpdId?: { nama: string }; alasanAbaikan?: string; selesaiPada?: string }[]).map((n) => (
                <li key={n._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:w-56">
                    <TingkatNotifikasi tingkat={n.tingkat} />
                    <span className="text-xs font-medium" title={PENJELASAN_ATURAN[n.aturan]}>
                      {LABEL_ATURAN[n.aturan] ?? n.aturan}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {n.tautan ? (
                      <Link href={n.tautan} className="text-sm hover:underline">
                        {n.pesan}
                      </Link>
                    ) : (
                      <p className="text-sm">{n.pesan}</p>
                    )}
                    <p className="mt-0.5 text-xs text-redup">
                      {n.skpdId?.nama ? `${n.skpdId.nama} · ` : ''}
                      {tanggal(n.createdAt, true)}
                      {n.selesaiPada && status !== 'terbuka' ? ` · ditutup ${tanggal(n.selesaiPada, true)}` : ''}
                    </p>
                    {n.alasanAbaikan && <p className="mt-1 text-xs">Alasan diabaikan: {n.alasanAbaikan}</p>}
                  </div>
                  {bolehAksi && status === 'terbuka' && <TombolAbaikan id={n._id} />}
                </li>
              ))}
            </ul>
            <Paginasi total={r.total} page={page} limit={50} dasar="/notifikasi" param={{ status, aturan: sp.aturan }} />
          </>
        ) : (
          <Kosong judul={status === 'terbuka' ? 'Tidak ada notifikasi terbuka' : 'Tidak ada notifikasi'} />
        )}
      </Kartu>
    </>
  );
}
