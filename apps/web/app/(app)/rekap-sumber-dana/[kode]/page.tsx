import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { boleh } from '@danboy/core';
import { detailSumberDana, rekapSumberDana, subkegiatanPerSumberDana } from '@danboy/core/services';
import { Rupiah, StatusSumberDana } from '@/components/domain';
import { DrawerSubkegiatan } from '@/components/subkegiatan';
import { Kartu, KepalaHalaman, Kosong, Lencana, Paginasi, Statistik, Tabel, TD, TH } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';

export const metadata: Metadata = { title: 'Sumber Dana' };

export default async function SubkegiatanSumberDana({ params, searchParams }: { params: Promise<{ kode: string }>; searchParams: SP }) {
  const { kode } = await params;
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const sd = await detailSumberDana(user, decodeURIComponent(kode)).catch(() => null);
  if (!sd) notFound();
  const page = num(sp.page, 1);
  const [daftar, rekap] = await Promise.all([
    subkegiatanPerSumberDana(user, String(tahapan._id), String(sd._id), page, 50),
    rekapSumberDana(user, String(tahapan._id)),
  ]);
  const r = rekap.baris.find((b) => b.sumberDanaId === String(sd._id));

  return (
    <>
      <KepalaHalaman
        judul={sd.nama}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{sd.kode}</span>
            {sd.khusus && <Lencana nada="info">Sumber dana khusus</Lencana>}
            <Link href="/rekap-sumber-dana" className="text-utama hover:underline">
              ← Rekap
            </Link>
          </span>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Statistik label="Pagu" nilai={<Rupiah nilai={r?.pagu ?? null} />} />
        <Statistik label="Terpakai" nilai={<Rupiah nilai={r?.terpakai ?? 0} />} sub={r?.persen != null ? `${r.persen.toLocaleString('id-ID')}% dari pagu` : undefined} />
        <Statistik label="Sisa" nilai={<Rupiah nilai={r?.sisa ?? null} />} nada={r && r.sisa !== null && r.sisa < 0 ? 'bahaya' : undefined} />
        <div className="rounded-lg border border-garis bg-permukaan p-4">
          <p className="text-xs font-medium text-redup">Status</p>
          <div className="mt-2">{r ? <StatusSumberDana status={r.status} /> : <Lencana>Tidak terpakai</Lencana>}</div>
        </div>
      </div>
      <Kartu judul={`Subkegiatan pemakai (${daftar.total})`} padat>
        {daftar.data.length ? (
          <>
            <Tabel>
              <thead>
                <tr>
                  <TH>Subkegiatan</TH>
                  <TH>SKPD / Sub unit</TH>
                  <TH kanan>Dari sumber dana ini</TH>
                  <TH kanan>Pagu subkegiatan</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {daftar.data.map((d: { _id: string; kodeSubkegiatan: string; namaSubkegiatan: string; nilaiSd: number; pagu: number; seimbang: boolean; skpd?: { nama: string }; subUnit?: { nama: string } }) => (
                  <tr key={d._id} className="hover:bg-latar/60">
                    <TD>
                      <p className="font-mono text-xs text-redup">{d.kodeSubkegiatan}</p>
                      <p>{d.namaSubkegiatan}</p>
                    </TD>
                    <TD className="text-redup">
                      {d.skpd?.nama}
                      {d.subUnit && d.subUnit.nama !== d.skpd?.nama && <span className="block text-xs">{d.subUnit.nama}</span>}
                    </TD>
                    <TD kanan className="font-medium">
                      <Rupiah nilai={d.nilaiSd} />
                    </TD>
                    <TD kanan>
                      <Rupiah nilai={d.pagu} />
                      {!d.seimbang && <span className="block text-xs text-waspada">belum seimbang</span>}
                    </TD>
                    <TD>
                      <Link href={`?id=${d._id}${page > 1 ? `&page=${page}` : ''}`} scroll={false} className="text-sm font-medium text-utama hover:underline">
                        {boleh(user, 'ubah_alokasi') ? 'Ubah' : 'Detail'}
                      </Link>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Tabel>
            <Paginasi total={daftar.total} page={page} limit={50} dasar="" param={{}} />
          </>
        ) : (
          <Kosong judul="Belum ada subkegiatan yang memakai sumber dana ini" />
        )}
      </Kartu>
      <DrawerSubkegiatan bolehUbah={boleh(user, 'ubah_alokasi')} />
    </>
  );
}
