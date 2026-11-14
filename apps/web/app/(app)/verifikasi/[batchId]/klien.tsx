'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/klien';
import { Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

/** Muat ulang halaman server setiap 1,5 detik selama verifikasi diproses. */
export function Pemantau({ aktif }: { aktif: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(t);
  }, [aktif, router]);
  return null;
}

/**
 * Centang pengingat "Sudah disesuaikan di SIPD". Berubah seketika (optimistis), lalu halaman dimuat ulang
 * agar daftar "belum" dan jumlah di notifikasi ikut berkurang.
 */
export function CentangSipd({ batchId, hasilId, awal, label }: { batchId: string; hasilId: string; awal: boolean; label: string }) {
  const [centang, setCentang] = useState(awal);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => setCentang(awal), [awal]);
  return (
    <label className="flex cursor-pointer items-center gap-2" title={centang ? 'Batalkan tanda' : 'Tandai sudah disesuaikan di SIPD'}>
      <input
        type="checkbox"
        className="size-5 cursor-pointer accent-[rgb(var(--aman))] disabled:cursor-wait"
        checked={centang}
        disabled={memuat}
        aria-label={`Sudah disesuaikan di SIPD: ${label}`}
        onChange={async (e) => {
          const nilai = e.target.checked;
          setCentang(nilai);
          setMemuat(true);
          try {
            const r = await api<{ progres: { sisa: number } }>(`/api/verifikasi/${batchId}/hasil/${hasilId}`, { method: 'PATCH', body: { selesai: nilai } });
            toast(nilai ? (r.progres.sisa ? `Ditandai. Sisa ${r.progres.sisa} subkegiatan.` : 'Ditandai. Semua sudah disesuaikan.') : 'Tanda dibatalkan', nilai ? 'aman' : 'info');
            router.refresh();
          } catch (err) {
            setCentang(!nilai);
            toast(pesanGalat(err), 'bahaya');
          } finally {
            setMemuat(false);
          }
        }}
      />
    </label>
  );
}

/** Cek ulang file yang sama terhadap alokasi aplikasi terbaru (misal setelah Admin memperbaiki alokasi). */
export function CekUlang({ batchId }: { batchId: string }) {
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <Tombol
      memuat={memuat}
      onClick={async () => {
        setMemuat(true);
        try {
          await api(`/api/impor/${batchId}/proses-ulang`, { method: 'POST' });
          toast('Diperiksa ulang terhadap alokasi terbaru');
          router.refresh();
        } catch (e) {
          toast(pesanGalat(e), 'bahaya');
        } finally {
          setMemuat(false);
        }
      }}
    >
      Cek ulang
    </Tombol>
  );
}
