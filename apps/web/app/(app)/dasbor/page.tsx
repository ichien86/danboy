import type { Metadata } from 'next';
import Link from 'next/link';
import { formatRupiah } from '@danboy/core';
import { daftarNotifikasi, ringkasanDasbor } from '@danboy/core/services';
import { LABEL_ATURAN, Rupiah, StatusSumberDana, StatusTahapan, TingkatNotifikasi, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Peringatan, Statistik, Tabel, TD, TH, TautanTombol } from '@/components/ui';
import { konteksHalaman, TanpaTahapan, type SP } from '@/lib/halaman';
import { GrafikPagu } from './grafik';

export const metadata: Metadata = { title: 'Dasbor' };

export default async function Dasbor({ searchParams }: { searchParams: SP }) {
  const { user, tahapan } = await konteksHalaman(searchParams);
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const id = String(tahapan._id);
  const [r, notif] = await Promise.all([ringkasanDasbor(user, id), daftarNotifikasi(user, { tahapanId: id, status: 'terbuka', limit: 6 })]);
  const a = r.angka;
  const skpd = user.peran === 'skpd';
  // akun SKPD: hanya alokasi perangkat daerahnya sendiri per sumber dana
  const sdSkpd = (r.rekap as unknown as { sumberDanaId: string; nama: string; terpakaiSkpd?: number; jumlahSubkegiatan: number }[])
    .map((b) => ({ id: b.sumberDanaId, nama: b.nama, nilai: b.terpakaiSkpd ?? 0, jumlah: b.jumlahSubkegiatan }))
    .filter((b) => b.nilai > 0)
    .sort((x, y) => y.nilai - x.nilai);
  const selisih = a.pagu - a.alokasi;
  const grafik = r.rekap
    .filter((b) => b.terpakai > 0 || (b.pagu ?? 0) > 0)
    .sort((x, y) => Math.max(y.pagu ?? 0, y.terpakai) - Math.max(x.pagu ?? 0, x.terpakai))
    .slice(0, 10)
    .map((b) => ({ nama: b.nama, pagu: b.pagu ?? 0, terpakai: b.terpakai, melebihi: b.status === 'melebihi' }));

  return (
    <>
      <KepalaHalaman
        judul="Dasbor"
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {skpd && r.perSkpd[0] && <strong className="font-semibold text-teks">{r.perSkpd[0].nama}</strong>}
            {tahapan.nama} <StatusTahapan status={tahapan.status} />
            <span>
              Jadwal {tanggal(tahapan.jadwalMulai)} – {tanggal(tahapan.jadwalSelesai)}
            </span>
          </span>
        }
        aksi={
          skpd ? (
            <TautanTombol href={`/api/ekspor/subkegiatan?tahapanId=${id}`} kecil>
              Unduh subkegiatan (Excel)
            </TautanTombol>
          ) : (
            <TautanTombol href={`/api/ekspor/rekap?tahapanId=${id}`} kecil>
              Unduh rekap (Excel)
            </TautanTombol>
          )
        }
      />
      {tahapan.status !== 'terbuka' && (
        <div className="mb-4">
          <Peringatan nada="waspada" judul={tahapan.status === 'ditutup' ? 'Tahapan ditutup' : 'Tahapan belum dibuka'}>
            Data hanya bisa dilihat. Perubahan alokasi dan impor ditolak sampai tahapan dibuka.
          </Peringatan>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Statistik label="Total pagu subkegiatan" nilai={formatRupiah(a.pagu, { juta: true })} sub={`${a.jumlah} subkegiatan`} />
        <Statistik
          label="Total alokasi sumber dana"
          nilai={formatRupiah(a.alokasi, { juta: true })}
          sub={selisih === 0 ? 'Seimbang dengan pagu' : `Selisih ${formatRupiah(selisih)}`}
          nada={selisih === 0 ? 'aman' : 'waspada'}
        />
        <Statistik label="Alokasi belum seimbang" nilai={a.tidakSeimbang} sub="subkegiatan (R4)" nada={a.tidakSeimbang ? 'waspada' : 'aman'} />
        {skpd ? (
          <Statistik label="Sumber dana digunakan" nilai={sdSkpd.length} sub={`${r.perSubUnit.length} sub unit`} />
        ) : (
          <Statistik
            label="Sumber dana melebihi pagu"
            nilai={r.totalRekap.melebihi}
            sub={`${r.totalRekap.komplit} komplit · ${r.totalRekap.mendekati} mendekati · ${r.totalRekap.belumDiisi} pagu belum diisi`}
            nada={r.totalRekap.melebihi ? 'bahaya' : 'aman'}
          />
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {skpd ? (
          <Kartu judul="Alokasi per sumber dana" padat className="xl:col-span-2">
            {sdSkpd.length ? (
              <Tabel>
                <thead>
                  <tr>
                    <TH>Sumber dana</TH>
                    <TH kanan>Subkegiatan</TH>
                    <TH kanan>Alokasi</TH>
                  </tr>
                </thead>
                <tbody>
                  {sdSkpd.map((b) => (
                    <tr key={b.id}>
                      <TD>
                        <Link href={`/subkegiatan?sumberDana=${b.id}`} className="hover:underline">
                          {b.nama}
                        </Link>
                      </TD>
                      <TD kanan>{b.jumlah}</TD>
                      <TD kanan>
                        <Rupiah nilai={b.nilai} />
                      </TD>
                    </tr>
                  ))}
                  <tr className="bg-latar font-semibold">
                    <TD>Jumlah</TD>
                    <TD />
                    <TD kanan>
                      <Rupiah nilai={a.alokasi} />
                    </TD>
                  </tr>
                </tbody>
              </Tabel>
            ) : (
              <Kosong judul="Belum ada data" />
            )}
          </Kartu>
        ) : (
          <Kartu judul="Pagu vs terpakai per sumber dana (10 terbesar)" className="xl:col-span-2">
            {grafik.length ? <GrafikPagu data={grafik} /> : <Kosong judul="Belum ada data">Impor rincian APBD dari SIPD untuk melihat grafik.</Kosong>}
          </Kartu>
        )}
        <Kartu
          judul="Notifikasi terbuka"
          padat
          aksi={
            <Link href="/notifikasi" className="text-xs font-medium text-utama hover:underline">
              Semua ({notif.total})
            </Link>
          }
        >
          {notif.data.length ? (
            <ul className="divide-y divide-garis">
              {(notif.data as { _id: string; pesan: string; tingkat: 'kritis' | 'peringatan' | 'info'; tautan?: string; aturan: string }[]).map((n) => (
                <li key={n._id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <TingkatNotifikasi tingkat={n.tingkat} />
                    <span className="text-xs text-redup">{LABEL_ATURAN[n.aturan] ?? n.aturan}</span>
                  </div>
                  {n.tautan ? (
                    <Link href={n.tautan} className="mt-1 block text-sm hover:underline">
                      {n.pesan}
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm">{n.pesan}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Kosong judul="Tidak ada masalah terbuka" />
          )}
        </Kartu>
      </div>

      {skpd && (
        <div className="mt-4">
          <Kartu judul="Pagu per sub unit" padat>
            <Tabel>
              <thead>
                <tr>
                  <TH>Sub unit</TH>
                  <TH kanan>Subkegiatan</TH>
                  <TH kanan>Pagu</TH>
                  <TH kanan>Alokasi sumber dana</TH>
                </tr>
              </thead>
              <tbody>
                {r.perSubUnit.map((s, i) => (
                  <tr key={i}>
                    <TD>{s.nama}</TD>
                    <TD kanan>{s.jumlah}</TD>
                    <TD kanan>
                      <Rupiah nilai={s.pagu} />
                    </TD>
                    <TD kanan className={s.alokasi !== s.pagu ? 'text-waspada' : undefined}>
                      <Rupiah nilai={s.alokasi} />
                    </TD>
                  </tr>
                ))}
                <tr className="bg-latar font-semibold">
                  <TD>Jumlah</TD>
                  <TD kanan>{a.jumlah}</TD>
                  <TD kanan>
                    <Rupiah nilai={a.pagu} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={a.alokasi} />
                  </TD>
                </tr>
              </tbody>
            </Tabel>
          </Kartu>
        </div>
      )}
      <div className={skpd ? 'hidden' : 'mt-4 grid gap-4 xl:grid-cols-2'}>
        <Kartu judul="Status sumber dana" padat aksi={<Link href="/rekap-sumber-dana" className="text-xs font-medium text-utama hover:underline">Rekap lengkap</Link>}>
          <Tabel>
            <thead>
              <tr>
                <TH>Sumber dana</TH>
                <TH kanan>Sisa</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {r.rekap
                .filter((b) => b.status !== 'aman' && b.status !== 'komplit')
                .slice(0, 8)
                .map((b) => (
                  <tr key={b.sumberDanaId}>
                    <TD>
                      <Link href={`/rekap-sumber-dana/${encodeURIComponent(b.kode)}`} className="hover:underline">
                        {b.nama}
                      </Link>
                    </TD>
                    <TD kanan>
                      <Rupiah nilai={b.sisa} />
                    </TD>
                    <TD>
                      <StatusSumberDana status={b.status} />
                    </TD>
                  </tr>
                ))}
              {!r.rekap.some((b) => b.status !== 'aman' && b.status !== 'komplit') && (
                <tr>
                  <TD colSpan={3} className="py-6 text-center text-redup">
                    Semua sumber dana berstatus aman atau komplit.
                  </TD>
                </tr>
              )}
            </tbody>
          </Tabel>
        </Kartu>
        {user.peran !== 'skpd' && (
          <Kartu judul="Pagu terbesar per SKPD" padat>
            <Tabel>
              <thead>
                <tr>
                  <TH>SKPD</TH>
                  <TH kanan>Subkegiatan</TH>
                  <TH kanan>Pagu</TH>
                </tr>
              </thead>
              <tbody>
                {r.perSkpd.map((s, i) => (
                  <tr key={i}>
                    <TD>{s.nama}</TD>
                    <TD kanan>{s.jumlah}</TD>
                    <TD kanan>
                      <Rupiah nilai={s.pagu} juta />
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Tabel>
          </Kartu>
        )}
      </div>
      {(a.beda > 0 || a.hilang > 0) && (
        <p className="mt-4 text-sm text-redup">
          {a.beda > 0 && (
            <Link href="/perbedaan" className="text-utama hover:underline">
              {a.beda} subkegiatan berbeda sumber dana dengan SIPD
            </Link>
          )}
          {a.beda > 0 && a.hilang > 0 && ' · '}
          {a.hilang > 0 && (
            <Link href="/subkegiatan?status=tidak_ada_di_impor" className="text-utama hover:underline">
              {a.hilang} subkegiatan tidak ada di impor terakhir
            </Link>
          )}
        </p>
      )}
    </>
  );
}
