import type { Metadata } from 'next';
import Link from 'next/link';
import { LABEL_PERAN_HIBAH, LABEL_STATUS_USULAN, peranHibah, type StatusUsulan } from '@danboy/core';
import { dashboardHibah } from '@danboy/core/services';
import { Rupiah, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Peringatan, Statistik, TautanTombol } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Hibah dan Bansos' };

/** Dashboard modul menurut peran (Rencana Pengembangan, bagian Pemilih Modul dan Dashboard). */
export default async function DashboardHibah() {
  const { user } = await halamanHibah('hibah_lihat_rekap');
  const peran = peranHibah(user)!;
  const d = (await dashboardHibah(user)) as Data;
  if (!d.tahun) {
    return (
      <>
        <KepalaHalaman judul="Dashboard Hibah dan Bansos" sub={`${user.nama} · ${LABEL_PERAN_HIBAH[peran]}`} />
        <Kartu>
          <Kosong judul="Belum ada tahun anggaran aktif">
            {peran === 'admin_perencana' ? (
              <TautanTombol href="/hibah-bansos/jadwal" varian="utama">
                Atur tahun dan jadwal
              </TautanTombol>
            ) : (
              'Admin Perencana belum mengatur tahun anggaran.'
            )}
          </Kosong>
        </Kartu>
      </>
    );
  }
  const per = Object.fromEntries((d.perStatus as Data[]).map((s) => [s._id, s])) as Record<StatusUsulan, Data | undefined>;
  const n = (s: StatusUsulan) => per[s]?.n ?? 0;
  const jumlah = (d.perStatus as Data[]).reduce((a, s) => ({ n: a.n + s.n, u: a.u + s.usulan, r: a.r + s.rekomendasi, dz: a.dz + s.disetujui }), { n: 0, u: 0, r: 0, dz: 0 });
  const berjalan = (d.jadwal as Data[]).find((j) => j.berjalan);
  return (
    <>
      <KepalaHalaman
        judul="Dashboard Hibah dan Bansos"
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            TA {d.tahun} · {LABEL_PERAN_HIBAH[peran]}
            {berjalan ? (
              <Lencana nada="aman">
                {berjalan.label} · {berjalan.sisaHari > 0 ? `sisa ${berjalan.sisaHari} hari` : 'berakhir hari ini'}
              </Lencana>
            ) : (
              <Lencana>Tidak ada tahapan berjalan</Lencana>
            )}
            {d.terkunci && <Lencana nada="info">Hasil terkunci</Lencana>}
          </span>
        }
      />
      {peran === 'admin_perencana' && d.drive && d.drive.status !== 'terhubung' && (
        <Peringatan nada="bahaya" judul="Google Drive belum terhubung">
          Berkas unggahan menunggu di server. <Link href="/hibah-bansos/drive" className="underline">Hubungkan Google Drive</Link>.
        </Peringatan>
      )}
      {peran === 'admin_perencana' && !d.drive && (
        <Peringatan nada="waspada" judul="Google Drive belum dihubungkan">
          <Link href="/hibah-bansos/drive" className="underline">Hubungkan akun Gmail khusus aplikasi</Link> agar berkas tersimpan di Drive.
        </Peringatan>
      )}
      {d.pdBelumUnggah?.length > 0 && (
        <Peringatan nada="waspada" judul={`Tahapan Evaluasi PD tinggal ${d.sisaHariEvaluasi} hari: ${d.pdBelumUnggah.length} PD belum mengunggah rekomendasi`}>
          {(d.pdBelumUnggah as Data[]).map((p) => `${p.namaPd} (${p.belumUnggah})`).join(', ')}
        </Peringatan>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Statistik label="Usulan" nilai={jumlah.n.toLocaleString('id-ID')} sub={peran === 'operator_pd' ? 'PD Anda' : 'semua PD'} />
        <Statistik label="Nilai usulan" nilai={<Rupiah nilai={jumlah.u} />} />
        <Statistik label="Nilai rekomendasi" nilai={<Rupiah nilai={jumlah.r} />} />
        <Statistik label="Nilai disetujui" nilai={<Rupiah nilai={jumlah.dz} />} sub={`${n('disetujui')} disetujui · ${n('ditolak')} ditolak`} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Kartu judul="Usulan per status" padat>
          <ul className="divide-y divide-garis">
            {(Object.keys(LABEL_STATUS_USULAN) as StatusUsulan[]).map((s) => (
              <li key={s} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Link href={`/hibah-bansos/usulan?status=${s}`} className="flex-1 hover:underline">
                  {LABEL_STATUS_USULAN[s]}
                </Link>
                <span className="w-12 text-right font-medium">{n(s)}</span>
                <span className="w-40 text-right text-redup">
                  <Rupiah nilai={per[s]?.usulan ?? 0} />
                </span>
              </li>
            ))}
          </ul>
        </Kartu>
        <div className="space-y-4">
          {peran === 'operator_pd' && (
            <Kartu judul="Perlu tindakan PD">
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/hibah-bansos/usulan?status=perbaikan" className="hover:underline">
                    Dikembalikan TAPD untuk perbaikan
                  </Link>{' '}
                  <Lencana nada={n('perbaikan') ? 'waspada' : 'netral'}>{n('perbaikan')}</Lencana>
                </li>
                <li>
                  <Link href="/hibah-bansos/usulan?status=draf" className="hover:underline">
                    Draf belum dikirim ke evaluasi
                  </Link>{' '}
                  <Lencana>{n('draf')}</Lencana>
                </li>
                <li>
                  <Link href="/hibah-bansos/usulan?status=evaluasi" className="hover:underline">
                    Menunggu evaluasi PD
                  </Link>{' '}
                  <Lencana>{n('evaluasi')}</Lencana>
                </li>
                <li>
                  <Link href="/hibah-bansos/rekomendasi" className="hover:underline">
                    Layak, belum masuk dokumen rekomendasi
                  </Link>{' '}
                  <Lencana nada={n('layak') ? 'utama' : 'netral'}>{n('layak')}</Lencana>
                </li>
                <li>
                  <Link href="/hibah-bansos/rekomendasi" className="hover:underline">
                    Dalam dokumen rekomendasi yang belum diunggah
                  </Link>{' '}
                  <Lencana>{n('dalam_rekomendasi')}</Lencana>
                </li>
              </ul>
            </Kartu>
          )}
          {peran === 'verifikator' && (
            <Kartu judul="Antrean verifikasi">
              <p className="text-3xl font-semibold">{n('rekomendasi_diunggah')}</p>
              <p className="text-sm text-redup">usulan dengan rekomendasi diunggah, {d.peringatan} di antaranya memiliki peringatan</p>
              <div className="mt-3">
                <TautanTombol href="/hibah-bansos/verifikasi" varian="utama">
                  Buka antrean
                </TautanTombol>
              </div>
            </Kartu>
          )}
          <Kartu judul="Jadwal tahapan" padat>
            <ul className="divide-y divide-garis">
              {(d.jadwal as Data[]).map((j) => (
                <li key={j.tahapan} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className={`flex-1 ${j.berjalan ? 'font-semibold' : ''}`}>{j.label}</span>
                  <span className="text-redup">{j.mulai ? `${tanggal(j.mulai)} – ${tanggal(j.selesai)}` : 'belum dijadwalkan'}</span>
                  {j.berjalan && <Lencana nada="aman">berjalan</Lencana>}
                </li>
              ))}
            </ul>
          </Kartu>
          {peran === 'admin_perencana' && d.berkas && (
            <Kartu judul="Berkas">
              <p className="text-sm">
                {d.berkas.tersimpan ?? 0} di Drive · {d.berkas.menunggu ?? 0} menunggu · {d.berkas.gagal ?? 0} gagal{' '}
                {d.drive?.email && <span className="text-redup">· {d.drive.email}</span>}
              </p>
            </Kartu>
          )}
        </div>
      </div>
    </>
  );
}
