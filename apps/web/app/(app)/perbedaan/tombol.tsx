'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

export function TombolIkutSemua({ tahapanId, jumlah, query }: { tahapanId: string; jumlah: number; query: string }) {
  const [buka, setBuka] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol varian="utama" onClick={() => setBuka(true)}>
        Ikut SIPD untuk semua
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Ikut SIPD untuk semua?">
        <p className="text-sm">
          Alokasi {jumlah} subkegiatan{query ? ' dalam saringan aktif' : ''} akan diganti dengan komposisi sumber dana SIPD dalam satu transaksi. Perubahan dicatat di log audit.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Tombol onClick={() => setBuka(false)}>Batal</Tombol>
          <Tombol
            varian="utama"
            memuat={memuat}
            onClick={async () => {
              setMemuat(true);
              try {
                const r = await api<{ jumlah: number }>(`/api/tahapan/${tahapanId}/perbedaan/ikut-sipd-semua${query ? `?${query}` : ''}`, { method: 'POST' });
                toast(`${r.jumlah} subkegiatan mengikuti SIPD`);
                setBuka(false);
                router.refresh();
              } catch (e) {
                toast(pesanGalat(e), 'bahaya');
              } finally {
                setMemuat(false);
              }
            }}
          >
            Ya, ikut SIPD
          </Tombol>
        </div>
      </Modal>
    </>
  );
}
