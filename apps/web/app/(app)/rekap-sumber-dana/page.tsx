import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { boleh } from '@danboy/core';
import { rekapSumberDana } from '@danboy/core/services';
import { Rupiah, StatusSumberDana } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH, TautanTombol } from '@/components/ui';
import { konteksHalaman, TanpaTahapan, type SP } from '@/lib/halaman';
import { FormPagu } from './form-pagu';
import { angka } from '@/lib/angka';

export const metadata: Metadata = { title: 'Rekap Sumber Dana' };

export default async function RekapSumberDana({ searchParams }: { searchParams: SP }) {
  const { user, tahapan, sp } = await konteksHalaman(searchParams);
  if (user.peran === 'skpd') redirect('/dasbor'); // rekap sumber dana tidak ditampilkan untuk akun SKPD
  if (!tahapan) return <TanpaTahapan superAdmin={user.peran === 'super_admin'} />;
  const id = String(tahapan._id);
  const r = await rekapSumberDana(user, id);
  const filter = sp.status;
  const baris = filter ? r.baris.filter((b) => b.status === filter) : r.baris;
  const skpd: boolean = false; // akun SKPD sudah dialihkan ke dasbor di atas
  const bolehPagu = boleh(user, 'isi_pagu') && tahapan.status === 'terbuka';

  return (
    <>
      <KepalaHalaman
        judul="Rekap Sumber Dana"
        sub={`${tahapan.nama} · ambang "mendekati" ${r.ambang}% dari pagu`}
        aksi={
          <>
            {bolehPagu && <FormPagu tahapanId={id} />}
            <TautanTombol href={`/api/ekspor/rekap?tahapanId=${id}`}>Unduh Excel</TautanTombol>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Saring status">
        {[
          ['', `Semua (${angka(r.baris.length)})`],
          ['melebihi', `Melebihi (${angka(r.total.melebihi)})`],
          ['komplit', `Komplit (${angka(r.total.komplit)})`],
          ['mendekati', `Mendekati (${angka(r.total.mendekati)})`],
          ['pagu_belum_diisi', `Pagu belum diisi (${angka(r.total.belumDiisi)})`],
        ].map(([v, l]) => (
          <Link
            key={v}
            href={v ? `?status=${v}` : '?'}
            className={`rounded-full border px-3 py-1 ${filter === v || (!filter && !v) ? 'border-utama bg-utama-lembut font-medium text-utama' : 'border-garis bg-permukaan text-redup hover:text-teks'}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <Kartu padat>
        {baris.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Kode</TH>
                <TH>Sumber dana</TH>
                <TH kanan>Pagu</TH>
                <TH kanan>Terpakai</TH>
                {skpd && <TH kanan>Bagian SKPD Anda</TH>}
                <TH kanan>Sisa</TH>
                <TH kanan>%</TH>
                <TH kanan>Subkeg.</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.sumberDanaId} className="hover:bg-latar/60">
                  <TD className="font-mono text-xs">{b.kode}</TD>
                  <TD>
                    <Link href={`/rekap-sumber-dana/${encodeURIComponent(b.kode)}`} className="font-medium hover:underline">
                      {b.nama}
                    </Link>
                    {b.khusus && (
                      <Lencana nada="info" className="ml-1.5">
                        khusus
                      </Lencana>
                    )}
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={b.pagu} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={b.terpakai} />
                  </TD>
                  {skpd && (
                    <TD kanan>
                      <Rupiah nilai={b.terpakaiSkpd} />
                    </TD>
                  )}
                  <TD kanan>
                    <Rupiah nilai={b.sisa} />
                  </TD>
                  <TD kanan>{b.persen === null ? '–' : `${b.persen.toLocaleString('id-ID')}%`}</TD>
                  <TD kanan>{angka(b.jumlahSubkegiatan)}</TD>
                  <TD>
                    <StatusSumberDana status={b.status} />
                  </TD>
                </tr>
              ))}
              <tr className="bg-latar/60 font-semibold">
                <TD colSpan={2}>Jumlah</TD>
                <TD kanan>
                  <Rupiah nilai={baris.reduce((a, b) => a + (b.pagu ?? 0), 0)} />
                </TD>
                <TD kanan>
                  <Rupiah nilai={baris.reduce((a, b) => a + b.terpakai, 0)} />
                </TD>
                {skpd && (
                  <TD kanan>
                    <Rupiah nilai={baris.reduce((a, b) => a + (b.terpakaiSkpd ?? 0), 0)} />
                  </TD>
                )}
                <TD colSpan={4} />
              </tr>
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul={filter ? 'Tidak ada sumber dana dengan status ini' : 'Belum ada data sumber dana'}>
            {!filter && 'Impor rincian APBD dari SIPD, lalu isi pagu tiap sumber dana.'}
          </Kosong>
        )}
      </Kartu>
    </>
  );
}
