import type { Metadata } from 'next';
import Link from 'next/link';
import { bolehHibah } from '@danboy/core';
import { daftarPenerima, opsiHibah } from '@danboy/core/services';
import { Kartu, KepalaHalaman, Kosong, Masukan, Paginasi, Tabel, TD, TH } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';
import { FormPenerima, type OpsiHibah } from './form';

export const metadata: Metadata = { title: 'Calon Penerima' };

export default async function HalamanPenerima({ searchParams }: { searchParams: SP }) {
  const { user, sp, operator } = await halamanHibah('hibah_lihat_usulan', searchParams);
  const page = Number(sp.page) || 1;
  const [d, opsi] = await Promise.all([daftarPenerima(user, { q: sp.q, page }), opsiHibah(user)]);
  const o = opsi as unknown as OpsiHibah;
  const jenis = new Map(o.jenis.map((j) => [j.kode, j.nama]));
  const desa = new Map(o.desa.map((x) => [x.kode, x.nama]));
  const r = d as Data;
  return (
    <>
      <KepalaHalaman
        judul="Calon Penerima"
        sub={operator ? 'Kartu buatan PD Anda dan penerima yang punya usulan di PD Anda. NIK tampil tersamar.' : 'Kartu calon penerima dari semua PD. NIK tampil tersamar.'}
        aksi={bolehHibah(user, 'hibah_input_usulan') ? <FormPenerima opsi={o} /> : undefined}
      />
      <Kartu padat>
        <form className="border-b border-garis px-4 py-3">
          <Masukan data-cari name="q" defaultValue={sp.q} placeholder="Cari nama, atau NIK/nomor lengkap…" className="h-9 w-80" aria-label="Cari calon penerima" />
        </form>
        {r.data.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Nama</TH>
                <TH>Jenis</TH>
                <TH>Identitas</TH>
                <TH>Kelurahan/desa</TH>
                <TH kanan>Usulan</TH>
              </tr>
            </thead>
            <tbody>
              {r.data.map((p: Data) => (
                <tr key={p._id}>
                  <TD>
                    <Link href={`/hibah-bansos/penerima/${p._id}`} className="font-medium text-utama hover:underline">
                      {p.nama}
                    </Link>
                  </TD>
                  <TD>{jenis.get(p.jenisPenerimaKode) ?? p.jenisPenerimaKode}</TD>
                  <TD className="font-mono text-xs">{p.identitas?.samaran ?? '–'}</TD>
                  <TD>{desa.get(p.desaKode) ?? '–'}</TD>
                  <TD kanan>{p.jumlahUsulan}</TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Belum ada calon penerima">{sp.q ? 'Tidak ada yang cocok dengan pencarian.' : 'Tambahkan kartu calon penerima sebelum membuat usulan.'}</Kosong>
        )}
        <Paginasi total={r.total} page={page} limit={r.limit} dasar="/hibah-bansos/penerima" param={{ q: sp.q }} />
      </Kartu>
    </>
  );
}
