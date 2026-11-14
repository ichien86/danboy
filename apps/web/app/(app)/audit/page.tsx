import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { daftarAudit } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Paginasi, Pilihan, Tombol } from '@/components/ui';
import { konteksHalaman, num, type SP } from '@/lib/halaman';

export const metadata: Metadata = { title: 'Log Audit' };

const KOLEKSI = ['subkegiatanTahapan', 'paguSumberDana', 'tagging', 'sumberDana', 'nomenklatur', 'skpd', 'subUnit', 'user', 'tahapan', 'tahunAnggaran'];

function ringkas(o?: Record<string, unknown>) {
  if (!o) return '';
  return Object.entries(o)
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v)}`)
    .join(' · ');
}

export default async function Audit({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await konteksHalaman(searchParams);
  if (!boleh(user, 'lihat_audit')) redirect('/dasbor');
  const page = num(sp.page, 1);
  const r = await daftarAudit(user, { koleksi: sp.koleksi, dokumenId: sp.dokumenId, page, limit: 50 });
  return (
    <>
      <KepalaHalaman judul="Log audit" sub="Hanya-tambah: setiap perubahan tercatat dengan pengguna, IP, dan waktu." />
      <form method="get" className="mb-3 flex gap-2">
        <Pilihan name="koleksi" defaultValue={sp.koleksi ?? ''} className="max-w-xs" aria-label="Koleksi">
          <option value="">Semua koleksi</option>
          {KOLEKSI.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Pilihan>
        <Tombol type="submit">Saring</Tombol>
      </form>
      <Kartu padat>
        {r.data.length ? (
          <>
            <ul className="divide-y divide-garis">
              {(r.data as unknown as { _id: string; aksi: string; koleksi: string; waktu: string; ip?: string; userId?: { nama: string; username: string }; sebelum?: Record<string, unknown>; sesudah?: Record<string, unknown> }[]).map((l) => (
                <li key={l._id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{l.userId?.nama ?? 'Sistem'}</span>
                    <span className="text-redup">{l.aksi}</span>
                    <span className="font-mono text-xs text-redup">{l.koleksi}</span>
                    <span className="ml-auto whitespace-nowrap text-xs text-redup">
                      {tanggal(l.waktu, true)}
                      {l.ip ? ` · ${l.ip}` : ''}
                    </span>
                  </div>
                  {(l.sebelum || l.sesudah) && (
                    <p className="mt-0.5 break-all text-xs text-redup">
                      {l.sebelum && Object.keys(l.sebelum).length > 0 && <>sebelum: {ringkas(l.sebelum)} → </>}
                      {ringkas(l.sesudah)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <Paginasi total={r.total} page={page} limit={50} dasar="/audit" param={{ koleksi: sp.koleksi, dokumenId: sp.dokumenId }} />
          </>
        ) : (
          <Kosong judul="Belum ada entri" />
        )}
      </Kartu>
    </>
  );
}
