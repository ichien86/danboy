import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { daftarPerbedaan } from '@danboy/core/services';
import { Rupiah } from '@/components/domain';
import { FilterSubkegiatan } from '@/components/filter';
import { DrawerSubkegiatan } from '@/components/subkegiatan';
import { Kartu, KepalaHalaman, Kosong, Paginasi, Peringatan, cx } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';
import { TombolIkutSemua } from './tombol';

export const metadata: Metadata = { title: 'Perbedaan Sumber Dana' };

interface Baris {
  _id: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  skpdId?: { nama: string };
  alokasi: { sumberDanaId: string; nilai: number; asal: string }[];
  alokasiSipd: { sumberDanaId: string; nilai: number }[];
}

export default async function Perbedaan({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!boleh(user, 'lihat_perbedaan')) redirect('/dasbor');
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const page = num(sp.page, 1);
  const filter = { q: sp.q, skpd: sp.skpd, sumberDana: sp.sumberDana };
  const r = await daftarPerbedaan(user, String(tahapan._id), { ...filter, page, limit: 50 });
  const sd = r.sumberDana as Record<string, { nama: string }>;
  const { id: _i, page: _p, ...param } = sp;
  void _i, _p;
  const terbuka = tahapan.status === 'terbuka';

  return (
    <>
      <KepalaHalaman
        judul="Perbedaan sumber dana vs SIPD"
        sub={`${tahapan.nama} · ${r.total} subkegiatan menunggu keputusan`}
        aksi={terbuka && r.total > 0 ? <TombolIkutSemua tahapanId={String(tahapan._id)} jumlah={r.total} query={new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString()} /> : undefined}
      />
      <div className="mb-3">
        <Peringatan nada="info">
          Komposisi sumber dana di SIPD berbeda dengan yang tersimpan. Pilih <b>Ikut SIPD</b> untuk menyalin komposisi SIPD, atau buka detail lalu ubah alokasi (<b>Edit Sendiri</b>). Keputusan diingat sampai komposisi SIPD berubah lagi.
        </Peringatan>
      </div>
      <FilterSubkegiatan user={user} sp={sp} dasar="/perbedaan" status={false} />
      <Kartu padat>
        {r.data.length ? (
          <>
            <ul className="divide-y divide-garis">
              {(r.data as unknown as Baris[]).map((d) => {
                const ids = [...new Set([...d.alokasi.map((a) => String(a.sumberDanaId)), ...d.alokasiSipd.map((a) => String(a.sumberDanaId))])];
                const t = new Map(d.alokasi.map((a) => [String(a.sumberDanaId), a.nilai]));
                const s = new Map(d.alokasiSipd.map((a) => [String(a.sumberDanaId), a.nilai]));
                const q = new URLSearchParams(Object.entries({ ...param, page: page > 1 ? String(page) : undefined, id: d._id }).filter(([, v]) => v) as [string, string][]);
                return (
                  <li key={d._id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_28rem]">
                    <div>
                      <p className="font-mono text-xs text-redup">{d.kodeSubkegiatan}</p>
                      <p className="font-medium">{d.namaSubkegiatan}</p>
                      <p className="text-sm text-redup">
                        {d.skpdId?.nama} · pagu <Rupiah nilai={d.pagu} />
                      </p>
                      <Link href={`/perbedaan?${q}`} scroll={false} className="mt-1 inline-block text-sm font-medium text-utama hover:underline">
                        Buka detail & putuskan
                      </Link>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-redup">
                          <th scope="col" className="pb-1 text-left font-medium">
                            Sumber dana
                          </th>
                          <th scope="col" className="pb-1 text-right font-medium">
                            Tersimpan
                          </th>
                          <th scope="col" className="pb-1 text-right font-medium">
                            SIPD
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {ids.map((id) => {
                          const beda = (t.get(id) ?? 0) !== (s.get(id) ?? 0);
                          return (
                            <tr key={id}>
                              <td className="py-0.5 pr-2">{sd[id]?.nama ?? id}</td>
                              <td className={cx('angka py-0.5 text-right', beda && 'bg-waspada-lembut font-semibold')}>
                                <Rupiah nilai={t.get(id) ?? 0} juta />
                              </td>
                              <td className={cx('angka py-0.5 text-right', beda && 'bg-waspada-lembut font-semibold')}>
                                <Rupiah nilai={s.get(id) ?? 0} juta />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </li>
                );
              })}
            </ul>
            <Paginasi total={r.total} page={page} limit={50} dasar="/perbedaan" param={param} />
          </>
        ) : (
          <Kosong judul="Tidak ada perbedaan">Semua komposisi sumber dana sudah sesuai SIPD atau sudah diputuskan.</Kosong>
        )}
      </Kartu>
      <DrawerSubkegiatan bolehUbah={boleh(user, 'ubah_alokasi')} />
    </>
  );
}
