import { daftarSkpd, daftarSumberDana } from '@danboy/core/services';
import type { SessionUser } from '@danboy/core';
import { Masukan, Pilihan, Tombol, TautanTombol } from './ui';

/** Form saring GET (tanpa JavaScript) untuk daftar subkegiatan. */
export async function FilterSubkegiatan({
  user,
  sp,
  dasar,
  status = true,
}: {
  user: SessionUser;
  sp: Record<string, string | undefined>;
  dasar: string;
  status?: boolean;
}) {
  const [skpd, sd] = await Promise.all([user.peran === 'skpd' ? [] : daftarSkpd(user), daftarSumberDana(user)]);
  return (
    <form method="get" action={dasar} className="mb-3 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
      <Masukan name="q" defaultValue={sp.q} placeholder="Kode atau nama subkegiatan" aria-label="Cari" className="lg:w-64" />
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
