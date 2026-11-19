import Link from 'next/link';
import type { SessionUser } from '@danboy/core';
import { daftarImpor } from '@danboy/core/services';
import { StatusBatch, tanggal } from './domain';
import { angka } from '@/lib/angka';

/** Riwayat impor singkat untuk satu jenis data, ditampilkan di bawah halaman pengelolaan data. */
export async function RiwayatImpor({ user, jenis, tahapanId, judul = 'Riwayat impor' }: { user: SessionUser; jenis: string | string[]; tahapanId?: string; judul?: string }) {
  const daftarJenis = Array.isArray(jenis) ? jenis : [jenis];
  const hasil = await Promise.all(daftarJenis.map((j) => daftarImpor(user, { jenis: j, tahapanId, limit: 5 })));
  const data = hasil
    .flatMap((r) => r.data as unknown as { _id: string; namaFile: string; jenis: string; status: string; createdAt: string; olehId?: { nama: string } }[])
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);
  if (!data.length) return null;
  return (
    <details className="mt-4 rounded-lg border border-garis bg-permukaan">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {judul} <span className="font-normal text-redup">({angka(data.length)} terakhir)</span>
      </summary>
      <ul className="divide-y divide-garis border-t border-garis">
        {data.map((b) => (
          <li key={b._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
            <Link href={`/impor/${b._id}`} className="font-medium hover:underline">
              {b.namaFile}
            </Link>
            <StatusBatch status={b.status} />
            <span className="ml-auto text-xs text-redup">
              {b.olehId?.nama} · {tanggal(b.createdAt, true)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
