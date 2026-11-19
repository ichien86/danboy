import type { Metadata } from 'next';
import { ringkasRiwayat } from '@danboy/core/services';
import { Rupiah, tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Lencana, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { ImporHibah } from './impor';

export const metadata: Metadata = { title: 'Riwayat Penerima' };

export default async function HalamanRiwayat() {
  const { user } = await halamanHibah('hibah_kelola_master');
  const r = (await ringkasRiwayat(user)) as Data;
  return (
    <>
      <KepalaHalaman
        judul="Riwayat Penerima"
        sub="Penerima hibah dan bansos TA 2025 dan 2026 dari semua PD, untuk peringatan penerimaan terus-menerus. Impor ulang satu tahun mengganti seluruh data tahun itu."
        aksi={<ImporHibah jenis="riwayat" />}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Kartu judul="Data tersimpan" padat>
          {r.ringkas.length ? (
            <Tabel>
              <thead>
                <tr>
                  <TH>Tahun</TH>
                  <TH>Kelompok</TH>
                  <TH kanan>Penerima</TH>
                  <TH kanan>Nilai</TH>
                </tr>
              </thead>
              <tbody>
                {r.ringkas.map((x: Data) => (
                  <tr key={`${x._id.tahun}-${x._id.kelompok}`}>
                    <TD>
                      TA {x._id.tahun} <span className="text-xs text-redup">({r.pdPerTahun.find((p: Data) => p.tahun === x._id.tahun)?.jumlahPd ?? 0} PD)</span>
                    </TD>
                    <TD>{x._id.kelompok === 'hibah' ? 'Hibah' : 'Bansos'}</TD>
                    <TD kanan>{new Intl.NumberFormat('id-ID').format(x.n)}</TD>
                    <TD kanan>
                      <Rupiah nilai={x.nilai} />
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Tabel>
          ) : (
            <Kosong judul="Belum ada riwayat">Unduh templat Excel, isi 12 kolomnya, lalu impor per tahun anggaran.</Kosong>
          )}
        </Kartu>
        <Kartu judul="Riwayat impor" padat>
          <Tabel>
            <thead>
              <tr>
                <TH>Waktu</TH>
                <TH>Berkas</TH>
                <TH>Tahun</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {r.riwayatImpor.map((x: Data) => (
                <tr key={x._id}>
                  <TD className="whitespace-nowrap">{tanggal(x.createdAt, true)}</TD>
                  <TD>{x.namaFile}</TD>
                  <TD>{x.tahun ?? '–'}</TD>
                  <TD>
                    <Lencana nada={x.status === 'diterapkan' ? 'aman' : x.status === 'batal' ? 'netral' : 'waspada'}>{x.status}</Lencana>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        </Kartu>
      </div>
    </>
  );
}
