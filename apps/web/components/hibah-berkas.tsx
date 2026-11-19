import { FileText, Lock } from 'lucide-react';
import { tanggal } from '@/components/domain';
import { Lencana } from '@/components/ui';
import { TombolAksi, UnggahBerkas } from '@/components/hibah';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STATUS = { tersimpan: { label: 'di Drive', nada: 'aman' }, menunggu: { label: 'menunggu kirim', nada: 'waspada' }, gagal: { label: 'gagal kirim', nada: 'bahaya' } } as const;

/** Daftar berkas: dibuka lewat modul (bukan tautan Drive), KTP/KK ditandai sensitif. */
export function DaftarBerkas({ berkas, bisaHapus, label }: { berkas: Data[]; bisaHapus?: boolean; label?: Record<string, string> }) {
  if (!berkas.length) return <p className="text-sm text-redup">Belum ada berkas.</p>;
  return (
    <ul className="divide-y divide-garis">
      {berkas.map((b) => {
        const s = STATUS[b.status as keyof typeof STATUS] ?? STATUS.menunggu;
        return (
          <li key={b._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            {b.sensitif ? <Lock className="size-4 text-waspada" aria-label="Sensitif" /> : <FileText className="size-4 text-redup" aria-hidden />}
            <a href={`/api/hibah/berkas/${b._id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-utama hover:underline">
              <span className="font-medium">{label?.[b.jenisDokumen] ?? b.jenisDokumen}</span> <span className="text-redup">· {b.nama}</span>
            </a>
            <span className="text-xs text-redup">{tanggal(b.createdAt, true)}</span>
            <Lencana nada={s.nada}>{s.label}</Lencana>
            {bisaHapus && b.pemilik?.jenis !== 'rekomendasi' && (
              <TombolAksi url={`/api/hibah/berkas/${b._id}`} method="DELETE" label="Hapus" varian="hantu" konfirmasi={`Hapus berkas ${b.nama}?`} berhasil="Berkas dihapus" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pilihan jenis dokumen lalu unggah; daftar diambil dari master berkas wajib, ditambah "lainnya". */
export function UnggahDenganJenis({ pemilikJenis, pemilikId, jenis }: { pemilikJenis: 'usulan' | 'penerima'; pemilikId: string; jenis: { kode: string; nama: string }[] }) {
  const daftar = [...jenis, { kode: 'lainnya', nama: 'Berkas pendukung lain' }];
  return (
    <div className="flex flex-wrap gap-2">
      {daftar.map((j) => (
        <UnggahBerkas key={j.kode} url="/api/hibah/berkas" data={{ pemilikJenis, pemilikId, jenisDokumen: j.kode }} label={j.nama} />
      ))}
    </div>
  );
}
