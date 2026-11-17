import type { Metadata } from 'next';
import Link from 'next/link';
import { boleh } from '@danboy/core';
import { batasUnggahMb, daftarSubkegiatan } from '@danboy/core/services';
import { TombolImpor } from '@/components/impor';
import { RiwayatImpor } from '@/components/riwayat-impor';
import { Rupiah } from '@/components/domain';
import { FilterSubkegiatan } from '@/components/filter';
import { DrawerSubkegiatan } from '@/components/subkegiatan';
import { Kartu, KepalaHalaman, Kosong, Lencana, Paginasi, Tabel, TD, TH, TautanTombol } from '@/components/ui';
import { konteksHalaman, num, TanpaTahapan, type SP } from '@/lib/halaman';

export const metadata: Metadata = { title: 'Subkegiatan' };

interface Baris {
  _id: string;
  kodeSubkegiatan: string;
  namaSubkegiatan: string;
  pagu: number;
  seimbang: boolean;
  status: string;
  beda: { ada: boolean };
  skpdId?: { nama: string };
  subUnitId?: { nama: string };
  alokasi: { sumberDanaId: { _id: string; nama: string; khusus: boolean } | null; nilai: number; asal: string }[];
}

export default async function HalamanSubkegiatan({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const page = num(sp.page, 1);
  const filter = { q: sp.q, skpd: sp.skpd, sumberDana: sp.sumberDana, status: sp.status as 'beda' | undefined, jumlahSd: sp.jumlahSd as 'satu' | undefined, bedaTagging: sp.bedaTagging };
  const r = await daftarSubkegiatan(user, String(tahapan._id), { ...filter, page, limit: 50 });
  const { id: _id, page: _p, ...param } = sp;
  void _id, _p;

  return (
    <>
      <KepalaHalaman
        judul="Subkegiatan"
        sub={`${tahapan.nama} · ${r.total} subkegiatan`}
        aksi={
          <>
            {boleh(user, 'impor') && (
              <TombolImpor
                jenis="apbd"
                label="Impor rincian APBD dari SIPD"
                batasMb={batasUnggahMb()}
                tahapan={{ _id: String(tahapan._id), nama: tahapan.nama }}
                nonaktif={tahapan.status === 'terbuka' ? undefined : `Tahapan ${tahapan.nama} tidak terbuka; impor ditolak (R10)`}
              />
            )}
            <TautanTombol href={`/api/ekspor/subkegiatan?${new URLSearchParams(Object.entries({ q: sp.q, skpd: sp.skpd, sumberDana: sp.sumberDana, status: sp.status, jumlahSd: sp.jumlahSd, bedaTagging: sp.bedaTagging, tahapanId: String(tahapan._id) }).filter(([, v]) => v) as [string, string][])}`}>Unduh Excel</TautanTombol>
          </>
        }
      />
      <FilterSubkegiatan user={user} sp={sp} dasar="/subkegiatan" jumlahSd />
      <Kartu padat>
        {r.data.length ? (
          <>
            <Tabel>
              <thead>
                <tr>
                  <TH>Subkegiatan</TH>
                  <TH>SKPD / Sub unit</TH>
                  <TH>Sumber dana</TH>
                  <TH kanan>Pagu</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {(r.data as unknown as Baris[]).map((d) => {
                  const q = new URLSearchParams(Object.entries({ ...param, page: page > 1 ? String(page) : undefined, id: d._id }).filter(([, v]) => v) as [string, string][]);
                  return (
                    <tr key={d._id} className="hover:bg-latar/60">
                      <TD>
                        <Link href={`/subkegiatan?${q}`} scroll={false} className="group block">
                          <span className="font-mono text-xs text-redup">{d.kodeSubkegiatan}</span>
                          <span className="block group-hover:underline">{d.namaSubkegiatan}</span>
                        </Link>
                      </TD>
                      <TD className="text-redup">
                        {d.skpdId?.nama}
                        {d.subUnitId && d.subUnitId.nama !== d.skpdId?.nama && <span className="block text-xs">{d.subUnitId.nama}</span>}
                      </TD>
                      <TD>
                        <ul className="space-y-0.5">
                          {d.alokasi.map((a, i) => (
                            <li key={i} className="flex justify-between gap-3 text-xs">
                              <span className="truncate">{a.sumberDanaId?.nama ?? '?'}</span>
                              <Rupiah nilai={a.nilai} />
                            </li>
                          ))}
                        </ul>
                      </TD>
                      <TD kanan>
                        <Rupiah nilai={d.pagu} />
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {!d.seimbang && <Lencana nada="waspada">R4 belum seimbang</Lencana>}
                          {d.beda?.ada && <Lencana nada="waspada">R2 beda SIPD</Lencana>}
                          {d.status === 'tidak_ada_di_impor' && <Lencana nada="bahaya">R8 tidak di impor</Lencana>}
                          {d.seimbang && !d.beda?.ada && d.status === 'aktif' && <Lencana nada="aman">OK</Lencana>}
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-garis bg-latar font-semibold">
                  <TD>Jumlah ({r.total} subkegiatan{Object.values(filter).some(Boolean) ? ', sesuai saringan' : ''})</TD>
                  <TD />
                  <TD>
                    <span className="flex justify-between gap-3 text-xs">
                      <span>Alokasi</span>
                      <Rupiah nilai={r.jumlah.alokasi} />
                    </span>
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={r.jumlah.pagu} />
                  </TD>
                  <TD />
                </tr>
              </tfoot>
            </Tabel>
            <Paginasi total={r.total} page={page} limit={50} dasar="/subkegiatan" param={param} />
          </>
        ) : (
          <Kosong judul="Tidak ada subkegiatan">{Object.values(filter).some(Boolean) ? 'Ubah saringan untuk melihat data lain.' : 'Impor rincian APBD dari SIPD terlebih dahulu.'}</Kosong>
        )}
      </Kartu>
      {boleh(user, 'impor') && <RiwayatImpor user={user} jenis="apbd" tahapanId={String(tahapan._id)} judul={`Riwayat impor APBD ${tahapan.nama}`} />}
      <DrawerSubkegiatan bolehUbah={boleh(user, 'ubah_alokasi')} />
    </>
  );
}
