import type { Metadata } from 'next';
import { daftarAuditHibah } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Lencana, Paginasi, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Audit Hibah dan Bansos' };

const ringkas = (v: unknown) => {
  if (!v || typeof v !== 'object') return '';
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`)
    .join(' · ')
    .slice(0, 400);
};

/** Jejak perubahan data modul; hanya baca (NFR-07). */
export default async function HalamanAudit({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_lihat_audit', searchParams);
  const page = Number(sp.page) || 1;
  const d = (await daftarAuditHibah(user, { page, koleksi: sp.koleksi })) as Data;
  return (
    <>
      <KepalaHalaman judul="Audit" sub="Setiap pembuatan, perubahan, pembukaan berkas KTP/KK, dan impor di modul Hibah dan Bansos. Nilai rahasia tidak pernah dicatat." />
      <Kartu padat>
        <Tabel>
          <thead>
            <tr>
              <TH>Waktu</TH>
              <TH>Pengguna</TH>
              <TH>Aksi</TH>
              <TH>Data</TH>
              <TH>Perubahan</TH>
            </tr>
          </thead>
          <tbody>
            {d.data.map((l: Data) => (
              <tr key={l._id}>
                <TD className="whitespace-nowrap">{tanggal(l.waktu, true)}</TD>
                <TD>{l.userId?.nama ?? '–'}</TD>
                <TD>
                  <Lencana>{l.aksi}</Lencana>
                </TD>
                <TD className="whitespace-nowrap font-mono text-xs">{l.koleksi}</TD>
                <TD className="max-w-xl text-xs text-redup">
                  {l.sebelum && Object.keys(l.sebelum).length > 0 && <p>Sebelum: {ringkas(l.sebelum)}</p>}
                  <p>{l.sebelum && Object.keys(l.sebelum).length > 0 ? 'Sesudah: ' : ''}{ringkas(l.sesudah)}</p>
                </TD>
              </tr>
            ))}
          </tbody>
        </Tabel>
        <Paginasi total={d.total} page={page} limit={d.limit} dasar="/hibah-bansos/audit" param={{ koleksi: sp.koleksi }} />
      </Kartu>
    </>
  );
}
