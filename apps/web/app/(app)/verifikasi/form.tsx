'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bidang, Masukan, Peringatan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

export function FormVerifikasi({ tahapanId, namaTahapan, batasMb }: { tahapanId: string; namaTahapan: string; batasMb: number }) {
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setGalat('');
        const fd = new FormData(e.currentTarget);
        const file = fd.get('file') as File | null;
        if (!String(fd.get('judul') ?? '').trim()) return setGalat('Isi judul verifikasi');
        if (!file || !file.size) return setGalat('Pilih file terlebih dahulu');
        if (file.size > batasMb * 1024 * 1024) return setGalat(`Ukuran file melebihi ${batasMb} MB`);
        if (!/\.(xlsx|csv)$/i.test(file.name)) return setGalat('Hanya file .xlsx atau .csv');
        fd.set('jenis', 'verifikasi');
        fd.set('tahapanId', tahapanId);
        setMemuat(true);
        try {
          const b = await api<{ _id: string }>('/api/impor', { form: fd });
          router.push(`/verifikasi/${b._id}`);
        } catch (err) {
          setGalat(pesanGalat(err));
          setMemuat(false);
        }
      }}
    >
      {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
      <p className="text-sm text-redup">
        Dibandingkan dengan alokasi di <b className="text-teks">{namaTahapan}</b>. Format sama dengan impor rincian APBD (kolom TAHUN, KODE SKPD, …, KODE SUMBER DANA, PAGU).
      </p>
      <Bidang label="Judul verifikasi" htmlFor="judul" bantuan="Tampil di daftar verifikasi dan notifikasi SKPD, menggantikan nama file.">
        <Masukan id="judul" name="judul" maxLength={120} required placeholder="mis. Verifikasi input SIPD minggu ke-2" />
      </Bidang>
      <Bidang label={`File ekspor SIPD .xlsx atau .csv (maks. ${batasMb} MB)`} htmlFor="file">
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.csv"
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-garis file:bg-latar file:px-3 file:py-1.5 file:text-sm file:text-teks"
        />
      </Bidang>
      <p className="text-xs text-redup">Setelah selesai, hasil verifikasi sebelumnya pada tahapan ini otomatis diganti oleh hasil yang baru.</p>
      <Tombol type="submit" varian="utama" memuat={memuat} className="w-full">
        Periksa kesesuaian
      </Tombol>
    </form>
  );
}
