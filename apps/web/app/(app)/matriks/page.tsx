import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { matriks } from '@danboy/core/services';
import { Rupiah } from '@/components/domain';
import { FilterSubkegiatan } from '@/components/filter';
import { DrawerSubkegiatan } from '@/components/subkegiatan';
import { Kartu, KepalaHalaman, Kosong, Paginasi, TautanTombol, cx } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';

export const metadata: Metadata = { title: 'Matriks' };

export default async function Matriks({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const page = num(sp.page, 1);
  const r = await matriks(user, String(tahapan._id), { q: sp.q, skpd: sp.skpd, sumberDana: sp.sumberDana, status: sp.status as 'beda' | undefined, page, limit: 100 });
  const kolom = r.kolom as unknown as { _id: string; kode: string; nama: string }[];
  const { id: _i, page: _p, ...param } = sp;
  void _i, _p;
  const th = 'border-b border-r border-garis bg-latar px-2 py-2 text-xs font-semibold text-redup';

  return (
    <>
      <KepalaHalaman
        judul="Matriks subkegiatan × sumber dana"
        sub={`${tahapan.nama} · ${r.total} subkegiatan × ${kolom.length} sumber dana`}
        aksi={<TautanTombol href={`/api/ekspor/matriks?tahapanId=${tahapan._id}`}>Unduh Excel</TautanTombol>}
      />
      <FilterSubkegiatan user={user} sp={sp} dasar="/matriks" />
      <Kartu padat>
        {r.data.length ? (
          <>
            <div className="max-h-[70vh] overflow-auto">
              <table className="border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th scope="col" className={cx(th, 'sticky left-0 z-30 min-w-72 text-left')}>
                      Subkegiatan
                    </th>
                    <th scope="col" className={cx(th, 'min-w-32 text-right')}>
                      Pagu
                    </th>
                    {kolom.map((k) => (
                      <th key={k._id} scope="col" className={cx(th, 'min-w-32 max-w-40 text-right align-bottom')} title={`${k.kode} ${k.nama}`}>
                        <span className="line-clamp-3">{k.nama}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(r.data as unknown as { _id: string; kodeSubkegiatan: string; namaSubkegiatan: string; pagu: number; seimbang: boolean; skpdId?: { nama: string }; alokasi: { sumberDanaId: string; nilai: number }[] }[]).map((d) => {
                    const per = new Map(d.alokasi.map((a) => [String(a.sumberDanaId), a.nilai]));
                    const q = new URLSearchParams(Object.entries({ ...param, page: page > 1 ? String(page) : undefined, id: d._id }).filter(([, v]) => v) as [string, string][]);
                    return (
                      <tr key={d._id} className="group">
                        <td className="sticky left-0 z-10 border-b border-r border-garis bg-permukaan px-2 py-1.5 group-hover:bg-latar">
                          <Link href={`/matriks?${q}`} scroll={false} className="hover:underline">
                            <span className="font-mono text-[11px] text-redup">{d.kodeSubkegiatan}</span>
                            <span className="line-clamp-1 block max-w-72">{d.namaSubkegiatan}</span>
                          </Link>
                        </td>
                        <td className={cx('angka border-b border-r border-garis px-2 py-1.5 text-right group-hover:bg-latar', !d.seimbang && 'text-waspada')}>
                          <Rupiah nilai={d.pagu} juta />
                        </td>
                        {kolom.map((k) => (
                          <td key={k._id} className="angka border-b border-r border-garis px-2 py-1.5 text-right group-hover:bg-latar">
                            {per.get(k._id) ? <Rupiah nilai={per.get(k._id)!} juta /> : <span className="text-garis">·</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="sticky bottom-0 z-20 font-semibold">
                    <td className="sticky left-0 z-30 border-r border-t border-garis bg-latar px-2 py-2">Jumlah (semua halaman)</td>
                    <td className="border-r border-t border-garis bg-latar" />
                    {kolom.map((k) => (
                      <td key={k._id} className="angka border-r border-t border-garis bg-latar px-2 py-2 text-right">
                        <Rupiah nilai={r.totalKolom[k._id] ?? 0} juta />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <Paginasi total={r.total} page={page} limit={100} dasar="/matriks" param={param} />
          </>
        ) : (
          <Kosong judul="Tidak ada data" />
        )}
      </Kartu>
      <DrawerSubkegiatan bolehUbah={boleh(user, 'ubah_alokasi')} />
    </>
  );
}
