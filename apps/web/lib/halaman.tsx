import 'server-only';
import type { TahapanDoc } from '@danboy/db';
import type { SessionUser } from '@danboy/core';
import { Kartu, Kosong, TautanTombol } from '@/components/ui';
import { tahapanAktif, wajibSesi } from './sesi';

export type SP = Promise<Record<string, string | string[] | undefined>>;

export const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
export const num = (v: string | string[] | undefined, d: number) => {
  const n = Number(str(v));
  return Number.isInteger(n) && n > 0 ? n : d;
};

export async function konteksHalaman(searchParams: SP): Promise<{ user: SessionUser; tahapan: (TahapanDoc & { _id: string }) | null; sp: Record<string, string | undefined> }> {
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, str(v)]));
  const [user, tahapan] = await Promise.all([wajibSesi(), tahapanAktif({ tahapan: sp.tahapan })]);
  return { user, tahapan: tahapan as (TahapanDoc & { _id: string }) | null, sp };
}

export function TanpaTahapan({ superAdmin }: { superAdmin: boolean }) {
  return (
    <Kartu>
      <Kosong judul="Belum ada tahapan anggaran">
        {superAdmin ? (
          <>
            <p>Buat tahun anggaran dan tahapan (KUA-PPAS, RAPBD, APBD, …) terlebih dahulu.</p>
            <div className="mt-4">
              <TautanTombol href="/pengaturan/tahapan" varian="utama">
                Atur tahapan
              </TautanTombol>
            </div>
          </>
        ) : (
          'Super Admin belum membuat tahapan anggaran.'
        )}
      </Kosong>
    </Kartu>
  );
}
