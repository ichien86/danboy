'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal } from './klien';
import { Bidang, Masukan, Peringatan, Tombol } from './ui';
import { api, pesanGalat } from '@/lib/klien';

export type JenisImpor = 'apbd' | 'nomenklatur' | 'sumber_dana' | 'rekening' | 'tagging' | 'skpd';

const FORMAT: Record<JenisImpor, string> = {
  apbd: 'Ekspor rincian APBD dari SIPD. Kolom wajib: TAHUN, KODE SKPD, NAMA SKPD, KODE SUB UNIT, NAMA SUB UNIT, KODE SUB KEGIATAN, NAMA SUB KEGIATAN, KODE SUMBER DANA, NAMA SUMBER DANA, KODE REKENING, PAGU.',
  nomenklatur: 'Satu kolom dengan penanda [URUSAN], [BIDANG URUSAN], [PROGRAM], [KEGIATAN]; baris subkegiatan tanpa penanda (kode 17 karakter lalu nama).',
  sumber_dana: 'Dua kolom: kode dan nama sumber dana. Induk dihitung dari kode.',
  rekening: 'Dua kolom: kode dan nama rekening.',
  skpd: 'Kolom KODE SKPD, NAMA SKPD, dan opsional KODE SUB UNIT, NAMA SUB UNIT. File ekspor rincian APBD dari SIPD juga bisa dipakai langsung. Impor ini tidak memengaruhi data APBD.',
  tagging: 'Kolom: Sumber Dana (nama tagging), Kategori / Bidang › Program, Rincian/Subbidang, Kode Subkegiatan, Nomenklatur (+ Kinerja, Indikator, Satuan).',
};

/**
 * Tombol "Impor dari file" di halaman pengelolaan data. Mengunggah file lalu membuka halaman pratinjau;
 * data baru berubah setelah pratinjau diterapkan.
 */
export function TombolImpor({
  jenis,
  label,
  batasMb,
  tahapan,
  tahun,
  nonaktif,
}: {
  jenis: JenisImpor;
  label: string;
  batasMb: number;
  tahapan?: { _id: string; nama: string } | null;
  tahun?: number;
  /** alasan tombol tidak bisa dipakai, mis. tahapan belum dibuka */
  nonaktif?: string;
}) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const router = useRouter();
  return (
    <>
      <Tombol onClick={() => setBuka(true)} disabled={!!nonaktif} title={nonaktif}>
        <Upload className="size-4" aria-hidden />
        {label}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={label} deskripsi="File diperiksa dulu dan ditampilkan sebagai pratinjau; data baru berubah setelah Anda menerapkannya.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setGalat('');
            const fd = new FormData(e.currentTarget);
            const file = fd.get('file') as File | null;
            if (!file || !file.size) return setGalat('Pilih file terlebih dahulu');
            if (file.size > batasMb * 1024 * 1024) return setGalat(`Ukuran file melebihi ${batasMb} MB`);
            if (!/\.(xlsx|csv)$/i.test(file.name)) return setGalat('Hanya file .xlsx atau .csv');
            fd.set('jenis', jenis);
            if (tahapan) fd.set('tahapanId', tahapan._id);
            setMemuat(true);
            try {
              const b = await api<{ _id: string }>('/api/impor', { form: fd });
              router.push(`/impor/${b._id}`);
            } catch (err) {
              setGalat(pesanGalat(err));
              setMemuat(false);
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <p className="text-sm text-redup">{FORMAT[jenis]}</p>
          {tahapan && (
            <Peringatan nada="info">
              Tahapan tujuan: <b>{tahapan.nama}</b>
            </Peringatan>
          )}
          {jenis === 'nomenklatur' && (
            <Bidang label="Versi nomenklatur" htmlFor="versi" bantuan="Misal 900.1-861-2026. Kosongkan untuk memakai nama file.">
              <Masukan id="versi" name="versi" maxLength={80} />
            </Bidang>
          )}
          {jenis === 'tagging' && (
            <Bidang label="Tahun anggaran" htmlFor="tahun">
              <Masukan id="tahun" name="tahun" type="number" min={2020} max={2100} defaultValue={tahun ?? new Date().getFullYear()} required />
            </Bidang>
          )}
          <Bidang label={`File .xlsx atau .csv (maks. ${batasMb} MB)`} htmlFor={`file-${jenis}`}>
            <input
              id={`file-${jenis}`}
              name="file"
              type="file"
              accept=".xlsx,.csv"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-garis file:bg-latar file:px-3 file:py-1.5 file:text-sm file:text-teks"
            />
          </Bidang>
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama" memuat={memuat}>
              Unggah & periksa
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
