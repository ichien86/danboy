'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

/** Tambah (tanpa `awal`) atau ubah nama rekening. Kewenangan Admin Keuangan. */
export function FormRekening({ awal }: { awal?: { _id: string; kode: string; nama: string } }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      {awal ? (
        <Tombol kecil varian="hantu" onClick={() => setBuka(true)}>
          Ubah
        </Tombol>
      ) : (
        <Tombol varian="utama" onClick={() => setBuka(true)}>
          <Plus className="size-4" aria-hidden /> Tambah rekening
        </Tombol>
      )}
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${awal.kode}` : 'Tambah rekening'}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMemuat(true);
            setGalat({});
            setUmum('');
            try {
              const nama = String(fd.get('nama')).trim();
              if (awal) await api(`/api/rekening/${awal._id}`, { method: 'PATCH', body: { nama } });
              else await api('/api/rekening', { body: { kode: String(fd.get('kode')).trim(), nama } });
              toast('Rekening disimpan');
              setBuka(false);
              router.refresh();
            } catch (err) {
              if (err instanceof GalatApi && err.detail) setGalat(err.detail);
              setUmum(pesanGalat(err));
            } finally {
              setMemuat(false);
            }
          }}
        >
          {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
          <Bidang label="Kode" htmlFor="kode" galat={galat.kode} bantuan={awal ? undefined : 'Contoh: 5.1.02.01.01.0026'}>
            <Masukan id="kode" name="kode" defaultValue={awal?.kode} disabled={!!awal} required={!awal} className="font-mono" />
          </Bidang>
          <Bidang label="Nama" htmlFor="nama" galat={galat.nama}>
            <Masukan id="nama" name="nama" defaultValue={awal?.nama} required />
          </Bidang>
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama" memuat={memuat}>
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
