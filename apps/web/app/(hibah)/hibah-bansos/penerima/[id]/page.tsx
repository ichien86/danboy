import type { Metadata } from 'next';
import Link from 'next/link';
import { bolehHibah, type StatusUsulan } from '@danboy/core';
import { berkasWajibUntuk, daftarBerkas, detailPenerima, opsiHibah } from '@danboy/core/services';
import { Rupiah } from '@/components/domain';
import { LencanaStatus } from '@/components/hibah';
import { DaftarBerkas, UnggahDenganJenis } from '@/components/hibah-berkas';
import { Kartu, KepalaHalaman, Lencana, Tabel, TautanTombol, TD, TH } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';
import { FormPenerima, type OpsiHibah } from '../form';

export const metadata: Metadata = { title: 'Kartu Penerima' };

export default async function KartuPenerima({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const { user, sp } = await halamanHibah('hibah_lihat_usulan', searchParams);
  const buka = sp.identitas === 'buka' && bolehHibah(user, 'hibah_buka_ktp');
  const [p, berkas, opsi] = (await Promise.all([detailPenerima(user, id, { bukaIdentitas: buka }), daftarBerkas(user, 'penerima', id), opsiHibah(user)])) as [Data, Data[], OpsiHibah];
  const jenis = opsi.jenis.find((j) => j.kode === p.jenisPenerimaKode);
  const wajib = (await berkasWajibUntuk(user, p.jenisPenerimaKode, 'penerima')) as Data[];
  const desa = opsi.desa.find((d) => d.kode === p.desaKode);
  const kec = opsi.kecamatan.find((k) => k.kode === p.kecamatanKode);
  const label = Object.fromEntries(wajib.map((w) => [w.kode, w.nama]));
  return (
    <>
      <KepalaHalaman
        judul={p.nama}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Lencana nada={jenis?.kelompok === 'bansos' ? 'info' : 'utama'}>{jenis?.nama ?? p.jenisPenerimaKode}</Lencana>
            <Link href="/hibah-bansos/penerima" className="text-utama hover:underline">
              ← Calon penerima
            </Link>
          </span>
        }
        aksi={
          <>
            {p.bisaDiubah && <FormPenerima opsi={opsi} awal={p} />}
            {bolehHibah(user, 'hibah_input_usulan') && (
              <TautanTombol href={`/hibah-bansos/usulan/baru?penerima=${p._id}`} varian="utama">
                Buat usulan
              </TautanTombol>
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Kartu judul="Data penerima">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-redup">Identitas</dt>
            <dd className="font-mono">
              {p.identitasLengkap ?? p.identitas?.samaran ?? '–'}
              {!buka && p.identitas && bolehHibah(user, 'hibah_buka_ktp') && (
                <Link href="?identitas=buka" className="ml-2 font-sans text-xs text-utama hover:underline">
                  tampilkan lengkap (tercatat di audit)
                </Link>
              )}
            </dd>
            {p.kk && (
              <>
                <dt className="text-redup">Nomor KK</dt>
                <dd className="font-mono">{p.kkLengkap ?? p.kk.samaran}</dd>
              </>
            )}
            <dt className="text-redup">Alamat</dt>
            <dd>{[p.alamat, desa && `${desa.jenis === 'kelurahan' ? 'Kel.' : 'Desa'} ${desa.nama}`, kec && `Kec. ${kec.nama}`].filter(Boolean).join(', ') || '–'}</dd>
            <dt className="text-redup">Penanggung jawab</dt>
            <dd>{p.penanggungJawab || '–'}</dd>
            <dt className="text-redup">Kontak</dt>
            <dd>{p.kontak || '–'}</dd>
          </dl>
        </Kartu>
        <Kartu judul="Berkas penerima">
          <DaftarBerkas berkas={berkas} bisaHapus={p.bisaDiubah} label={label} />
          {p.bisaDiubah && (
            <div className="mt-3 border-t border-garis pt-3">
              <UnggahDenganJenis pemilikJenis="penerima" pemilikId={p._id} jenis={wajib.map((w) => ({ kode: w.kode, nama: w.nama }))} />
            </div>
          )}
        </Kartu>
        <Kartu judul="Usulan di modul" padat>
          <Tabel>
            <thead>
              <tr>
                <TH>Nomor</TH>
                <TH>TA</TH>
                <TH>Perangkat Daerah</TH>
                <TH>Status</TH>
                <TH kanan>Usulan</TH>
                <TH kanan>Disetujui</TH>
              </tr>
            </thead>
            <tbody>
              {p.usulan.map((u: Data) => (
                <tr key={u._id}>
                  <TD>
                    <Link href={`/hibah-bansos/usulan/${u._id}`} className="text-utama hover:underline">
                      {u.nomor}
                    </Link>
                  </TD>
                  <TD>{u.tahun}</TD>
                  <TD>{u.namaPd}</TD>
                  <TD>
                    <LencanaStatus status={u.status as StatusUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiDisetujui} />
                  </TD>
                </tr>
              ))}
              {!p.usulan.length && (
                <tr>
                  <TD colSpan={6} className="py-6 text-center text-redup">
                    Belum ada usulan
                  </TD>
                </tr>
              )}
            </tbody>
          </Tabel>
        </Kartu>
        <Kartu judul="Riwayat penerimaan TA sebelumnya (impor)" padat>
          <Tabel>
            <thead>
              <tr>
                <TH>TA</TH>
                <TH>Nama di riwayat</TH>
                <TH>PD</TH>
                <TH kanan>Nilai</TH>
                <TH>Kecocokan</TH>
              </tr>
            </thead>
            <tbody>
              {p.riwayat.map((r: Data) => (
                <tr key={r._id}>
                  <TD>{r.tahun}</TD>
                  <TD>{r.nama}</TD>
                  <TD>{r.namaPd}</TD>
                  <TD kanan>
                    <Rupiah nilai={r.nilai} />
                  </TD>
                  <TD>
                    <Lencana nada={r.tingkat === 'sama' ? 'bahaya' : 'waspada'}>{r.tingkat === 'sama' ? 'sama' : 'kemungkinan sama'}</Lencana>
                  </TD>
                </tr>
              ))}
              {!p.riwayat.length && (
                <tr>
                  <TD colSpan={5} className="py-6 text-center text-redup">
                    Tidak ada di riwayat TA 2025–2026
                  </TD>
                </tr>
              )}
            </tbody>
          </Tabel>
        </Kartu>
      </div>
    </>
  );
}
