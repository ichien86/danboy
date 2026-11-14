'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

interface SD {
  _id: string;
  kode: string;
  nama: string;
  khusus: boolean;
  namaTagging?: string | null;
  aktif: boolean;
}

export function FormSumberDana({ awal }: { awal?: SD }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
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
          Tambah sumber dana
        </Tombol>
      )}
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${awal.nama}` : 'Tambah sumber dana'}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body = {
              ...(awal ? {} : { kode: String(fd.get('kode')).trim() }),
              nama: String(fd.get('nama')).trim(),
              khusus: fd.get('khusus') === 'on',
              namaTagging: String(fd.get('namaTagging') ?? '').trim() || null,
              aktif: fd.get('aktif') === 'on',
            };
            setMemuat(true);
            setGalat('');
            try {
              await api(awal ? `/api/sumber-dana/${awal._id}` : '/api/sumber-dana', { method: awal ? 'PATCH' : 'POST', body });
              toast('Sumber dana disimpan');
              setBuka(false);
              router.refresh();
            } catch (err) {
              setGalat(err instanceof GalatApi ? err.message : pesanGalat(err));
            } finally {
              setMemuat(false);
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Bidang label="Kode" htmlFor="kode" bantuan="Kode SIPD, misal 1.2.01.08.01. Induk dihitung otomatis dari kode.">
            <Masukan id="kode" name="kode" defaultValue={awal?.kode} disabled={!!awal} required={!awal} />
          </Bidang>
          <Bidang label="Nama" htmlFor="nama">
            <Masukan id="nama" name="nama" defaultValue={awal?.nama} required />
          </Bidang>
          <Bidang label="Nama tagging" htmlFor="namaTagging" bantuan="Nama di daftar tagging (misal DAU SG Pendidikan). Satu nama tagging boleh dipetakan ke beberapa kode.">
            <Masukan id="namaTagging" name="namaTagging" defaultValue={awal?.namaTagging ?? ''} />
          </Bidang>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="khusus" defaultChecked={awal?.khusus} /> Sumber dana khusus (penggunaan wajib sesuai tagging)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aktif" defaultChecked={awal?.aktif ?? true} /> Aktif
          </label>
          <div className="flex justify-between gap-2">
            {awal ? (
              <Tombol
                type="button"
                varian="hantu"
                className="text-bahaya"
                onClick={async () => {
                  if (!confirm(`Hapus ${awal.nama}? Hanya bisa bila belum pernah dipakai.`)) return;
                  try {
                    await api(`/api/sumber-dana/${awal._id}`, { method: 'DELETE' });
                    toast('Sumber dana dihapus');
                    setBuka(false);
                    router.refresh();
                  } catch (err) {
                    setGalat(pesanGalat(err));
                  }
                }}
              >
                Hapus
              </Tombol>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Tombol type="button" onClick={() => setBuka(false)}>
                Batal
              </Tombol>
              <Tombol type="submit" varian="utama" memuat={memuat}>
                Simpan
              </Tombol>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
