'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { AreaTeks, Bidang, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

export function TombolAbaikan({ id }: { id: string }) {
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol kecil varian="hantu" onClick={() => setBuka(true)}>
        Abaikan
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Abaikan notifikasi" deskripsi="Notifikasi yang diabaikan tidak muncul lagi untuk masalah yang sama.">
        <Bidang label="Alasan (wajib)" htmlFor="alasan">
          <AreaTeks id="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={500} />
        </Bidang>
        <div className="mt-4 flex justify-end gap-2">
          <Tombol onClick={() => setBuka(false)}>Batal</Tombol>
          <Tombol
            varian="utama"
            disabled={alasan.trim().length < 3}
            memuat={memuat}
            onClick={async () => {
              setMemuat(true);
              try {
                await api(`/api/notifikasi/${id}`, { method: 'PATCH', body: { alasan } });
                toast('Notifikasi diabaikan');
                setBuka(false);
                router.refresh();
              } catch (e) {
                toast(pesanGalat(e), 'bahaya');
              } finally {
                setMemuat(false);
              }
            }}
          >
            Abaikan
          </Tombol>
        </div>
      </Modal>
    </>
  );
}
