import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { bolehHibah, LABEL_STATUS_USULAN, type AksiHibah, type StatusUsulan } from '@danboy/core';
import { daftarUsulan, opsiHibah, skpdSemua, tahunAktifAtauNull } from '@danboy/core/services';
import { filterUsulan } from '@danboy/schema';
import { Rupiah } from '@/components/domain';
import { LencanaStatus } from '@/components/hibah';
import { Kartu, KepalaHalaman, Kosong, Paginasi, Pilihan, Masukan, Tabel, TautanTombol, TD, TH, Tombol } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';

/** Daftar usulan; juga dipakai halaman Verifikasi dengan saringan status bawaan (FR-29). */
export async function DaftarUsulanHalaman({ searchParams, judul, sub, statusBawaan, dasar, aksi = 'hibah_lihat_usulan' }: { searchParams: SP; judul: string; sub: string; statusBawaan?: string; dasar: string; aksi?: AksiHibah }) {
  const { user, sp, operator } = await halamanHibah(aksi, searchParams);
  const t = await tahunAktifAtauNull();
  if (!t) {
    return (
      <>
        <KepalaHalaman judul={judul} />
        <Kartu>
          <Kosong judul="Belum ada tahun anggaran aktif">Admin Perencana perlu mengatur Tahun dan Jadwal terlebih dahulu.</Kosong>
        </Kartu>
      </>
    );
  }
  const f = filterUsulan.parse({ ...sp, status: sp.status ?? statusBawaan, page: sp.page });
  const [d, opsi, skpd] = (await Promise.all([daftarUsulan(user, f), opsiHibah(user), operator ? Promise.resolve([]) : skpdSemua()])) as [Data, Data, Data[]];
  const jenis = new Map((opsi.jenis as Data[]).map((j) => [j.kode, j.nama]));
  const tot = (d.ringkas as Data[]).reduce((a, r) => ({ usulan: a.usulan + r.usulan, rekomendasi: a.rekomendasi + r.rekomendasi, disetujui: a.disetujui + r.disetujui }), { usulan: 0, rekomendasi: 0, disetujui: 0 });
  return (
    <>
      <KepalaHalaman
        judul={judul}
        sub={`${sub} TA ${d.tahun}.`}
        aksi={bolehHibah(user, 'hibah_input_usulan') ? <TautanTombol href="/hibah-bansos/usulan/baru" varian="utama">Buat usulan</TautanTombol> : undefined}
      />
      <Kartu padat>
        <form className="flex flex-wrap items-end gap-2 border-b border-garis px-4 py-3">
          <Masukan data-cari name="q" defaultValue={sp.q} placeholder="Nama penerima atau nomor…" className="h-9 w-56" aria-label="Cari usulan" />
          {!operator && (
            <Pilihan name="skpd" defaultValue={sp.skpd ?? ''} className="h-9 w-56" aria-label="Perangkat Daerah">
              <option value="">Semua PD</option>
              {skpd.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nama}
                </option>
              ))}
            </Pilihan>
          )}
          <Pilihan name="jenis" defaultValue={sp.jenis ?? ''} className="h-9 w-48" aria-label="Jenis penerima">
            <option value="">Semua jenis</option>
            {(opsi.jenis as Data[]).map((j) => (
              <option key={j.kode} value={j.kode}>
                {j.nama}
              </option>
            ))}
          </Pilihan>
          <Pilihan name="bentuk" defaultValue={sp.bentuk ?? ''} className="h-9 w-32" aria-label="Bentuk">
            <option value="">Semua bentuk</option>
            <option value="uang">Uang</option>
            <option value="barang">Barang</option>
          </Pilihan>
          <Pilihan name="status" defaultValue={f.status ?? ''} className="h-9 w-48" aria-label="Status">
            <option value="">Semua status</option>
            {statusBawaan && <option value={statusBawaan}>Antrean verifikasi</option>}
            {Object.entries(LABEL_STATUS_USULAN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Pilihan>
          <label className="flex h-9 items-center gap-1.5 text-sm">
            <input type="checkbox" name="peringatan" value="1" defaultChecked={!!sp.peringatan} /> Ada peringatan
          </label>
          <Tombol type="submit" kecil>
            Saring
          </Tombol>
        </form>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-garis px-4 py-2 text-sm">
          <span>
            <span className="text-redup">Usulan:</span> {d.total}
          </span>
          <span>
            <span className="text-redup">Nilai usulan:</span> <Rupiah nilai={tot.usulan} />
          </span>
          <span>
            <span className="text-redup">Rekomendasi:</span> <Rupiah nilai={tot.rekomendasi} />
          </span>
          <span>
            <span className="text-redup">Disetujui:</span> <Rupiah nilai={tot.disetujui} />
          </span>
        </div>
        {d.data.length ? (
          <Tabel>
            <thead>
              <tr>
                <TH>Nomor</TH>
                <TH>Penerima</TH>
                {!operator && <TH>Perangkat Daerah</TH>}
                <TH>Jenis · bentuk</TH>
                <TH>Status</TH>
                <TH kanan>Usulan</TH>
                <TH kanan>Rekomendasi</TH>
                <TH kanan>Disetujui</TH>
              </tr>
            </thead>
            <tbody>
              {d.data.map((u: Data) => (
                <tr key={u._id}>
                  <TD className="whitespace-nowrap">
                    <Link href={`/hibah-bansos/usulan/${u._id}`} className="font-medium text-utama hover:underline">
                      {u.nomor}
                    </Link>
                    {u.peringatan?.length > 0 && <AlertTriangle className="ml-1 inline size-3.5 text-waspada" aria-label="Ada peringatan" />}
                  </TD>
                  <TD>
                    <p>{u.penerima?.nama}</p>
                    {u.penerima?.identitas?.samaran && <p className="font-mono text-xs text-redup">{u.penerima.identitas.samaran}</p>}
                  </TD>
                  {!operator && <TD>{u.namaPd}</TD>}
                  <TD className="text-redup">
                    {jenis.get(u.jenisPenerimaKode) ?? u.jenisPenerimaKode} · {u.bentuk}
                  </TD>
                  <TD>
                    <LencanaStatus status={u.status as StatusUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiUsulan} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiRekomendasi} />
                  </TD>
                  <TD kanan>
                    <Rupiah nilai={u.nilaiDisetujui} />
                  </TD>
                </tr>
              ))}
            </tbody>
          </Tabel>
        ) : (
          <Kosong judul="Tidak ada usulan">Ubah saringan, atau buat usulan baru dari kartu calon penerima.</Kosong>
        )}
        <Paginasi total={d.total} page={f.page} limit={f.limit} dasar={dasar} param={{ q: sp.q, skpd: sp.skpd, jenis: sp.jenis, bentuk: sp.bentuk, status: sp.status, peringatan: sp.peringatan }} />
      </Kartu>
    </>
  );
}
