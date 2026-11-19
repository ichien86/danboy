import type { Metadata } from 'next';
import Link from 'next/link';
import { bolehHibah } from '@danboy/core';
import { daftarRekomendasi, tahunAktifAtauNull } from '@danboy/core/services';
import { Rupiah, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { FormRekomendasi } from './form';

export const metadata: Metadata = { title: 'Dokumen Rekomendasi' };

export default async function HalamanRekomendasi() {
  const { user, operator } = await halamanHibah('hibah_lihat_usulan');
  if (!(await tahunAktifAtauNull())) {
    return (
      <Kartu>
        <Kosong judul="Belum ada tahun anggaran aktif" />
      </Kartu>
    );
  }
  const d = (await daftarRekomendasi(user)) as Data;
  return (
    <>
      <KepalaHalaman
        judul="Dokumen Rekomendasi"
        sub={`Dokumen rekomendasi Kepala PD TA ${d.tahun}. Unduh .docx berkop, tandatangani basah atau elektronik di luar aplikasi, lalu unggah hasilnya; usulan di dalamnya terkunci dan sampai ke TAPD.`}
        aksi={bolehHibah(user, 'hibah_rekomendasi') ? <FormRekomendasi /> : undefined}
      />
      <Kartu padat>
        {d.data.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Nomor</TH>
                {!operator && <TH>Perangkat Daerah</TH>}
                <TH>Tanggal</TH>
                <TH kanan>Usulan</TH>
                <TH kanan>Nilai usulan</TH>
                <TH kanan>Nilai rekomendasi</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {d.data.map((r: Data) => (
                <tr key={r._id}>
                  <TD>
                    <Link href={`/hibah-bansos/rekomendasi/${r._id}`} className="font-medium text-utama hover:underline">
                      {r.nomor}
                    </Link>
                  </TD>
                  {!operator && <TD>{r.namaPd}</TD>}
                  <TD className="whitespace-nowrap">{tanggal(r.tanggal)}</TD>
                  <TD kanan>{r.usulanIds.length}</TD>
                  <TD kanan>
                    <Rupiah nilai={r.nilaiUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={r.nilaiRekomendasi} />
                  </TD>
                  <TD>
                    <Lencana nada={r.status === 'diunggah' ? 'aman' : 'waspada'}>{r.status === 'diunggah' ? 'Sudah diunggah' : 'Draf, belum ditandatangani'}</Lencana>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada dokumen rekomendasi">Usulan berstatus Layak dimasukkan ke dokumen rekomendasi sebelum dikirim ke TAPD.</Kosong>
        )}
      </Kartu>
    </>
  );
}
