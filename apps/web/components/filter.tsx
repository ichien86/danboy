import { daftarSkpd, daftarSumberDana } from '@danboy/core/services';
import type { SessionUser } from '@danboy/core';
import { Masukan, Pilihan, Tombol, TautanTombol } from './ui';

/** Form saring GET (tanpa JavaScript) untuk daftar subkegiatan. */
export async function FilterSubkegiatan({
  user,
  sp,
  dasar,
  status = true,
  jumlahSd = false,
}: {
  user: SessionUser;
  sp: Record<string, string | undefined>;
  dasar: string;
  status?: boolean;
  /** Tampilkan kotak centang: lebih dari satu sumber dana, beda dengan tagging. */
  jumlahSd?: boolean;
}) {
  const [skpd, sd] = await Promise.all([user.peran === 'skpd' ? [] : daftarSkpd(user), daftarSumberDana(user)]);
  return (
    <form method="get" action={dasar} className="mb-3 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
      <Masukan name="q" data-cari defaultValue={sp.q} placeholder="Kode atau nama subkegiatan  (tekan /)" aria-label="Cari" className="lg:w-64" />
      {user.peran !== 'skpd' && (
        <Pilihan name="skpd" defaultValue={sp.skpd ?? ''} aria-label="SKPD" className="lg:w-64">
          <option value="">Semua SKPD</option>
          {(skpd as unknown as { _id: string; nama: string }[]).map((s) => (
            <option key={s._id} value={s._id}>
              {s.nama}
            </option>
          ))}
        </Pilihan>
      )}
      <Pilihan name="sumberDana" defaultValue={sp.sumberDana ?? ''} aria-label="Sumber dana" className="lg:w-56">
        <option value="">Semua sumber dana</option>
        {(sd as unknown as { _id: string; kode: string; nama: string }[]).map((s) => (
          <option key={s._id} value={s._id}>
            {s.nama}
          </option>
        ))}
      </Pilihan>
      {status && (
        <Pilihan name="status" defaultValue={sp.status ?? ''} aria-label="Status" className="lg:w-48">
          <option value="">Semua status</option>
          <option value="tidak_seimbang">Belum seimbang (R4)</option>
          <option value="beda">Beda dengan SIPD (R2)</option>
          <option value="tidak_ada_di_impor">Tidak ada di impor (R8)</option>
        </Pilihan>
      )}
      {jumlahSd && (
        <label className="flex cursor-pointer items-center gap-2 py-2 text-sm">
          <input type="checkbox" name="jumlahSd" value="dua_lebih" defaultChecked={sp.jumlahSd === 'dua_lebih'} className="h-4 w-4" />
          Lebih dari satu sumber dana
        </label>
      )}
      {jumlahSd && (
        <label className="flex cursor-pointer items-center gap-2 py-2 text-sm" title="Subkegiatan ada di daftar tagging, tetapi tidak memakai sumber dana tagging-nya">
          <input type="checkbox" name="bedaTagging" value="1" defaultChecked={!!sp.bedaTagging} className="h-4 w-4" />
          Beda dengan tagging
        </label>
      )}
      <div className="flex gap-2">
        <Tombol type="submit" varian="utama">
          Saring
        </Tombol>
        <TautanTombol href={dasar} varian="hantu">
          Reset
        </TautanTombol>
      </div>
    </form>
  );
}
