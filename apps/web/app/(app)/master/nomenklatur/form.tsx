'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

const JENIS = [
  ['urusan', 'Urusan', '1'],
  ['bidang', 'Bidang urusan', '1.01'],
  ['program', 'Program', '1.01.02'],
  ['kegiatan', 'Kegiatan', '1.01.02.2.01'],
  ['subkegiatan', 'Subkegiatan', '1.01.02.2.01.0001'],
] as const;

export interface Nomen {
  _id: string;
  kode: string;
  nama: string;
  jenis: string;
  aktif?: boolean;
}

/** Tambah (tanpa `awal`) atau ubah nama/status nomenklatur. Kewenangan Super Admin. */
export function FormNomenklatur({ awal, kecil, jenisAwal, onTersimpan }: { awal?: Nomen; kecil?: boolean; jenisAwal?: string; onTersimpan?: () => void }) {
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState(jenisAwal ?? 'subkegiatan');
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const contoh = JENIS.find((j) => j[0] === jenis)?.[2];
  return (
    <>
      {awal ? (
        <button type="button" onClick={() => setBuka(true)} className="rounded p-1 text-redup hover:bg-latar hover:text-teks" aria-label={`Ubah ${awal.nama}`} title="Ubah">
          <Pencil className="size-3.5" />
        </button>
      ) : (
        <Tombol varian="utama" kecil={kecil} onClick={() => setBuka(true)}>
          <Plus className="size-4" aria-hidden /> Tambah nomenklatur
        </Tombol>
      )}
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${awal.kode}` : 'Tambah nomenklatur'}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMemuat(true);
            setGalat({});
            setUmum('');
            try {
              if (awal) await api(`/api/nomenklatur/${awal._id}`, { method: 'PATCH', body: { nama: String(fd.get('nama')).trim(), aktif: fd.get('aktif') === 'on' } });
              else await api('/api/nomenklatur', { body: { jenis, kode: String(fd.get('kode')).trim(), nama: String(fd.get('nama')).trim() } });
              toast('Nomenklatur disimpan');
              setBuka(false);
              onTersimpan?.();
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
          {!awal && (
            <Bidang label="Jenis" htmlFor="jenis">
              <Pilihan id="jenis" value={jenis} onChange={(e) => setJenis(e.target.value)}>
                {JENIS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
          )}
          <Bidang label="Kode" htmlFor="kode" galat={galat.kode} bantuan={awal ? undefined : `Contoh: ${contoh}. Induknya harus sudah ada.`}>
            <Masukan id="kode" name="kode" defaultValue={awal?.kode} disabled={!!awal} required={!awal} className="font-mono" />
          </Bidang>
          <Bidang label="Nama" htmlFor="nama" galat={galat.nama}>
            <Masukan id="nama" name="nama" defaultValue={awal?.nama} required />
          </Bidang>
          {awal && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="aktif" defaultChecked={awal.aktif ?? true} /> Aktif (nonaktif: tidak dipakai untuk pemeriksaan impor APBD)
            </label>
          )}
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
