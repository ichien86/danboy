import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert, Tag } from 'lucide-react';
import { formatRupiah, type StatusSumberDana as Status } from '@danboy/core';
import { Lencana, cx } from './ui';

/** Format Rp 1.234.567, rata kanan, opsi tampil dalam juta. */
export function Rupiah({ nilai, juta, className, negatifMerah = true }: { nilai: number | null | undefined; juta?: boolean; className?: string; negatifMerah?: boolean }) {
  return (
    <span className={cx('angka whitespace-nowrap', negatifMerah && typeof nilai === 'number' && nilai < 0 && 'text-bahaya', className)} title={juta && nilai != null ? formatRupiah(nilai) : undefined}>
      {formatRupiah(nilai, { juta })}
    </span>
  );
}

const STATUS: Record<Status, { label: string; nada: 'aman' | 'waspada' | 'bahaya' | 'netral'; ikon: typeof CheckCircle2 }> = {
  aman: { label: 'Aman', nada: 'aman', ikon: CheckCircle2 },
  mendekati: { label: 'Mendekati', nada: 'waspada', ikon: AlertTriangle },
  melebihi: { label: 'Melebihi', nada: 'bahaya', ikon: OctagonAlert },
  pagu_belum_diisi: { label: 'Pagu belum diisi', nada: 'netral', ikon: CircleDashed },
};

/** Lencana status sumber dana dengan ikon dan teks (tidak hanya warna). */
export function StatusSumberDana({ status }: { status: Status }) {
  const s = STATUS[status];
  const Ikon = s.ikon;
  return (
    <Lencana nada={s.nada}>
      <Ikon className="size-3" aria-hidden />
      {s.label}
    </Lencana>
  );
}

export function LencanaTagging({ nama, kategori, rincian }: { nama: string; kategori?: string; rincian?: string }) {
  const tip = [kategori && `Bidang/Program: ${kategori}`, rincian && `Rincian/Subbidang: ${rincian}`].filter(Boolean).join('\n');
  return (
    <Lencana nada="info" title={tip || undefined}>
      <Tag className="size-3" aria-hidden />
      {nama}
    </Lencana>
  );
}

const TAHAPAN: Record<string, { label: string; nada: 'aman' | 'netral' | 'waspada' }> = {
  draf: { label: 'Draf', nada: 'netral' },
  terbuka: { label: 'Terbuka', nada: 'aman' },
  ditutup: { label: 'Ditutup', nada: 'waspada' },
};
export function StatusTahapan({ status }: { status: string }) {
  const s = TAHAPAN[status] ?? { label: status, nada: 'netral' as const };
  return <Lencana nada={s.nada}>{s.label}</Lencana>;
}

const BATCH: Record<string, { label: string; nada: 'aman' | 'netral' | 'waspada' | 'bahaya' | 'info' }> = {
  diunggah: { label: 'Diunggah', nada: 'netral' },
  diproses: { label: 'Diproses', nada: 'info' },
  pratinjau: { label: 'Pratinjau', nada: 'waspada' },
  diterapkan: { label: 'Diterapkan', nada: 'aman' },
  dibatalkan: { label: 'Dibatalkan', nada: 'netral' },
  gagal: { label: 'Gagal', nada: 'bahaya' },
  selesai: { label: 'Selesai', nada: 'aman' },
};
export function StatusBatch({ status }: { status: string }) {
  const s = BATCH[status] ?? { label: status, nada: 'netral' as const };
  return <Lencana nada={s.nada}>{s.label}</Lencana>;
}

const TINGKAT = { kritis: 'bahaya', peringatan: 'waspada', info: 'info' } as const;
export function TingkatNotifikasi({ tingkat }: { tingkat: 'kritis' | 'peringatan' | 'info' }) {
  return <Lencana nada={TINGKAT[tingkat]}>{tingkat[0].toUpperCase() + tingkat.slice(1)}</Lencana>;
}

export const LABEL_ATURAN: Record<string, string> = {
  R0: 'Nilai SIPD diperbarui',
  R1: 'Pagu/nilai berubah',
  R2: 'Sumber dana berbeda',
  R3: 'Pagu sumber dana terlampaui',
  R4: 'Alokasi belum seimbang',
  R5: 'Di luar daftar tagging',
  R6: 'Tertagging, didanai sumber lain',
  R7: 'Subkegiatan baru',
  R8: 'Tidak ada di impor terakhir',
  R9: 'Kode perlu dipetakan',
  R10: 'Tahapan terkunci',
  VS: 'Input SIPD belum sesuai',
};

export const tanggal = (d: string | Date | null | undefined, jam = false) =>
  d
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', ...(jam ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Jakarta' }).format(new Date(d))
    : '–';
