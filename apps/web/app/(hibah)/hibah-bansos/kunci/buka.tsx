'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { AreaTeks, Bidang, Peringatan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

/** Buka kunci (BR-12): alasan wajib dan tercatat; Berita Acara yang sudah dibuat menjadi usang. */
export function BukaKunci({ tahun, skpdId, label }: { tahun: number; skpdId?: string; label: string }) {
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol kecil={!!skpdId} varian="bahaya" onClick={() => setBuka(true)}>
        {label}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Buka kunci hasil verifikasi">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/hibah/kunci/buka', { body: { tahun, skpdId: skpdId ?? null, alasan } });
              toast('Kunci dibuka');
              setBuka(false);
              router.refresh();
            } catch (err) {
              setGalat(pesanGalat(err));
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Peringatan nada="waspada">Berita Acara yang mencakup hasil ini menjadi usang dan harus dibuat serta dicetak ulang.</Peringatan>
          <Bidang label="Alasan (tercatat di log)" htmlFor="k-alasan">
            <AreaTeks id="k-alasan" rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} required />
          </Bidang>
          <div className="flex justify-end">
            <Tombol type="submit" varian="bahaya">
              Buka kunci
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
