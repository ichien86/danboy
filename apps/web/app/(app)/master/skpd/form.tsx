'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

/** Tambah/ubah SKPD atau sub unit. skpdId diisi = tambah sub unit di SKPD itu. */
export function FormUnit({ awal, skpdId, subUnit }: { awal?: { _id: string; kode: string; nama: string; aktif: boolean }; skpdId?: string; subUnit?: boolean }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const jenis = skpdId || subUnit ? 'sub unit' : 'SKPD';
  return (
    <>
      <Tombol kecil={!!(awal || skpdId)} varian={awal ? 'hantu' : skpdId ? 'biasa' : 'utama'} onClick={() => setBuka(true)}>
        {awal ? 'Ubah' : skpdId ? '+ Sub unit' : 'Tambah SKPD'}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${jenis}` : `Tambah ${jenis}`}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Record<string, unknown> = { kode: String(fd.get('kode')).trim(), nama: String(fd.get('nama')).trim(), aktif: fd.get('aktif') === 'on' };
            if (skpdId) body.skpdId = skpdId;
            const url = awal ? (subUnit ? `/api/sub-unit/${awal._id}` : `/api/skpd/${awal._id}`) : skpdId ? '/api/sub-unit' : '/api/skpd';
            setMemuat(true);
            setGalat('');
            try {
              await api(url, { method: awal ? 'PATCH' : 'POST', body });
              toast(`${jenis} disimpan`);
              setBuka(false);
              router.refresh();
            } catch (err) {
              setGalat(pesanGalat(err));
            } finally {
              setMemuat(false);
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Bidang label="Kode" htmlFor="kode" bantuan="Disimpan apa adanya seperti di SIPD.">
            <Masukan id="kode" name="kode" defaultValue={awal?.kode} required />
          </Bidang>
          <Bidang label="Nama" htmlFor="nama">
            <Masukan id="nama" name="nama" defaultValue={awal?.nama} required />
          </Bidang>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="aktif" defaultChecked={awal?.aktif ?? true} /> Aktif
          </label>
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
