import type { Metadata } from 'next';
import { bolehHibah } from '@danboy/core';
import { daftarTemplat, skpdSemua } from '@danboy/core/services';
import { TombolAksi } from '@/components/hibah';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Kosong, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data } from '@/lib/hibah';
import { UnggahTemplat } from './unggah';

export const metadata: Metadata = { title: 'Templat Dokumen' };

const LABEL = { rekomendasi: 'Dokumen rekomendasi', berita_acara: 'Berita Acara', lampiran: 'Lampiran I dan II' } as const;

export default async function HalamanTemplat() {
  const { user, operator } = await halamanHibah('hibah_kelola_templat_pd');
  const ap = bolehHibah(user, 'hibah_kelola_master');
  const [data, skpd] = await Promise.all([daftarTemplat(user), ap ? skpdSemua() : Promise.resolve([])]);
  return (
    <>
      <KepalaHalaman
        judul="Templat Dokumen"
        sub={
          operator
            ? 'Templat Word berkop surat PD Anda untuk dokumen rekomendasi. Unduh templat bawaan, ganti kopnya, lalu unggah kembali.'
            : 'Templat Word berkop untuk dokumen rekomendasi per PD, Berita Acara, dan lampiran. Penanda isian ditulis {nama}; perulangan baris tabel {#usulan}…{/usulan}.'
        }
        aksi={<UnggahTemplat ap={ap} skpd={(skpd as Data[]).map((s) => ({ _id: s._id, nama: s.nama }))} />}
      />
      <Kartu judul="Templat bawaan sistem" className="mb-4">
        <div className="flex flex-wrap gap-2 text-sm">
          {(ap ? (['rekomendasi', 'berita_acara', 'lampiran'] as const) : (['rekomendasi'] as const)).map((j) => (
            <a key={j} href={`/api/hibah/templat/unduh?jenis=${j}&bawaan=1`} className="rounded-md border border-garis px-3 py-1.5 hover:bg-latar">
              Unduh {LABEL[j]} (.docx)
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-redup">Penanda wajib: rekomendasi {'{nomor}'}, {'{tanggal}'}, {'{#usulan}…{/usulan}'}; Berita Acara {'{nomor}'}, {'{tanggal}'}, {'{#rekap}…{/rekap}'}, {'{#tapd}…{/tapd}'}; lampiran {'{judul}'}, {'{#baris}…{/baris}'}.</p>
      </Kartu>
      <Kartu judul="Templat aktif" padat>
        {(data as Data[]).length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Jenis</TH>
                <TH>Perangkat Daerah</TH>
                <TH>Berkas</TH>
                <TH>Versi</TH>
                <TH>Diunggah</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {(data as Data[]).map((t) => (
                <tr key={t._id}>
                  <TD>{LABEL[t.jenis as keyof typeof LABEL]}</TD>
                  <TD>{t.namaPd}</TD>
                  <TD>{t.nama}</TD>
                  <TD>{t.versi}</TD>
                  <TD className="whitespace-nowrap">{tanggal(t.createdAt, true)}</TD>
                  <TD>
                    <TombolAksi url={`/api/hibah/templat/${t._id}`} method="DELETE" label="Nonaktifkan" varian="hantu" konfirmasi="Nonaktifkan templat ini? Dokumen akan memakai templat bawaan." berhasil="Templat dinonaktifkan" />
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada templat unggahan">Dokumen memakai templat bawaan sistem sampai templat berkop diunggah.</Kosong>
        )}
      </Kartu>
    </>
  );
}
