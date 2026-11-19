'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

export function FormBeritaAcara({ tahun, kunciTahun, pd }: { tahun: number; kunciTahun: boolean; pd: { _id: string; nama: string }[] }) {
  const [buka, setBuka] = useState(false);
  const [cakupan, setCakupan] = useState<'semua' | 'pd'>(kunciTahun ? 'semua' : 'pd');
  const [pilih, setPilih] = useState<string[]>([]);
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol varian="utama" onClick={() => setBuka(true)} disabled={!kunciTahun && !pd.length}>
        Buat Berita Acara
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={`Berita Acara TA ${tahun}`}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              await api('/api/hibah/berita-acara', {
                body: {
                  tahun,
                  nomor: fd.get('nomor'),
                  tanggal: new Date(`${fd.get('tanggal')}T00:00:00+07:00`).toISOString(),
                  ...(cakupan === 'pd' ? { skpdIds: pilih } : {}),
                },
              });
              toast('Berita Acara dibuat');
              setBuka(false);
              router.refresh();
            } catch (err) {
              setGalat(pesanGalat(err));
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Bidang label="Nomor" htmlFor="ba-nomor">
            <Masukan id="ba-nomor" name="nomor" required />
          </Bidang>
          <Bidang label="Tanggal" htmlFor="ba-tgl">
            <Masukan id="ba-tgl" name="tanggal" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </Bidang>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">Cakupan</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked={cakupan === 'semua'} onChange={() => setCakupan('semua')} disabled={!kunciTahun} /> Seluruh PD {!kunciTahun && <span className="text-xs text-redup">(kunci seluruh tahun dulu)</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={cakupan === 'pd'} onChange={() => setCakupan('pd')} /> PD tertentu yang sudah terkunci
            </label>
          </fieldset>
          {cakupan === 'pd' && (
            <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-garis p-2 text-sm">
              {pd.map((p) => (
                <label key={p._id} className="flex items-center gap-2">
                  <input type="checkbox" checked={pilih.includes(p._id)} onChange={(e) => setPilih((x) => (e.target.checked ? [...x, p._id] : x.filter((y) => y !== p._id)))} /> {p.nama}
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Tombol type="submit" varian="utama" disabled={cakupan === 'pd' && !pilih.length}>
              Buat
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
