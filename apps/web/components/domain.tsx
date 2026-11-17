import { AlertTriangle, CheckCircle2, CircleCheckBig, CircleDashed, OctagonAlert, Tag } from 'lucide-react';
import { formatRupiah, type StatusSumberDana as Status } from '@danboy/core';
import { Lencana, cx } from './ui';

/** Format Rp1.234.567 (tanpa spasi), rata kanan, opsi tampil dalam juta. */
export function Rupiah({ nilai, juta, className, negatifMerah = true }: { nilai: number | null | undefined; juta?: boolean; className?: string; negatifMerah?: boolean }) {
  return (
    <span className={cx('angka whitespace-nowrap', negatifMerah && typeof nilai === 'number' && nilai < 0 && 'text-bahaya', className)} title={juta && nilai != null ? formatRupiah(nilai) : undefined}>
      {formatRupiah(nilai, { juta })}
    </span>
  );
}

const STATUS: Record<Status, { label: string; nada: 'aman' | 'waspada' | 'bahaya' | 'netral' | 'info'; ikon: typeof CheckCircle2 }> = {
  aman: { label: 'Aman', nada: 'aman', ikon: CheckCircle2 },
  mendekati: { label: 'Mendekati', nada: 'waspada', ikon: AlertTriangle },
  komplit: { label: 'Komplit', nada: 'info', ikon: CircleCheckBig },
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

/** Nama yang tampil untuk setiap jenis temuan/notifikasi. Kode (R1, R2, …) hanya dipakai di dalam sistem. */
export const LABEL_ATURAN: Record<string, string> = {
  R0: 'Nilai SIPD diperbarui',
  R1: 'Pagu atau nilai berubah',
  R2: 'Sumber dana beda dengan SIPD',
  R3: 'Pagu sumber dana terlampaui',
  R4: 'Alokasi belum seimbang',
  R5: 'Di luar daftar tagging',
  R6: 'Tertagging, didanai sumber lain',
  R7: 'Subkegiatan baru',
  R8: 'Hilang dari SIPD',
  R9: 'Belum ada di master',
  R10: 'Tahapan terkunci',
  VS: 'Input SIPD belum sesuai',
  PD: 'Nama perangkat daerah berbeda',
};

/** Penjelasan singkat tiap jenis notifikasi, untuk tooltip dan halaman Notifikasi. */
export const PENJELASAN_ATURAN: Record<string, string> = {
  R2: 'Komposisi sumber dana di SIPD berbeda dengan yang tersimpan; putuskan Ikut SIPD atau Edit Sendiri di menu Perbedaan SIPD.',
  R3: 'Jumlah alokasi suatu sumber dana melebihi pagu sumber dana yang diisi Admin Keuangan.',
  R4: 'Jumlah alokasi sumber dana suatu subkegiatan belum sama dengan pagunya.',
  R5: 'Subkegiatan didanai sumber dana khusus tetapi tidak ada di daftar tagging tahun ini.',
  R8: 'Subkegiatan ada di aplikasi tetapi tidak ada lagi di impor SIPD terakhir.',
  R9: 'Impor SIPD merujuk subkegiatan, sumber dana, SKPD, atau sub unit yang belum ada di master; barisnya ditahan.',
  VS: 'Hasil Verifikasi SIPD: sumber dana yang diinput SKPD di SIPD belum sama dengan alokasi di aplikasi.',
  PD: 'Nama SKPD/sub unit di file SIPD berbeda dengan master perangkat daerah; data tetap ditautkan menurut kode.',
};

export const tanggal = (d: string | Date | null | undefined, jam = false) =>
  d
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', ...(jam ? { timeStyle: 'short' } : {}), timeZone: 'Asia/Jakarta' }).format(new Date(d))
    : '–';
