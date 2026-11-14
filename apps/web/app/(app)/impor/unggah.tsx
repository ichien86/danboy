'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

const JENIS = [
  { v: 'apbd', l: 'Rincian APBD ekspor SIPD', b: 'Kolom wajib: TAHUN, KODE SKPD, NAMA SKPD, KODE SUB UNIT, NAMA SUB UNIT, KODE SUB KEGIATAN, NAMA SUB KEGIATAN, KODE SUMBER DANA, NAMA SUMBER DANA, KODE REKENING, PAGU.' },
  { v: 'verifikasi', l: 'Verifikasi input SIPD (tidak mengubah data)', b: 'Format sama dengan rincian APBD. Sumber dana di file dicek terhadap alokasi di aplikasi; hasilnya laporan per SKPD.' },
  { v: 'sumber_dana', l: 'Master sumber dana', b: 'Dua kolom: kode dan nama.' },
  { v: 'nomenklatur', l: 'Master nomenklatur', b: 'Satu kolom dengan penanda [URUSAN], [BIDANG URUSAN], [PROGRAM], [KEGIATAN]; subkegiatan tanpa penanda.' },
  { v: 'rekening', l: 'Master rekening', b: 'Dua kolom: kode dan nama.' },
  { v: 'tagging', l: 'Daftar tagging', b: 'Kolom: Sumber Dana, Kategori / Bidang › Program, Rincian/Subbidang, Kode Subkegiatan, Nomenklatur (+ Kinerja, Indikator, Satuan).' },
];

export function FormUnggah({ tahapan, batasMb }: { tahapan: { _id: string; nama: string; status: string; tahun: number } | null; batasMb: number }) {
  const [jenis, setJenis] = useState('apbd');
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const router = useRouter();
  const info = JENIS.find((j) => j.v === jenis)!;
  const apbdTerkunci = jenis === 'apbd' && (!tahapan || tahapan.status !== 'terbuka');

  return (
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
        if ((jenis === 'apbd' || jenis === 'verifikasi') && tahapan) fd.set('tahapanId', tahapan._id);
        if (jenis === 'tagging' && !fd.get('tahun')) fd.set('tahun', String(tahapan?.tahun ?? new Date().getFullYear()));
        setMemuat(true);
        try {
          const b = await api<{ _id: string }>('/api/impor', { form: fd });
          router.push(jenis === 'verifikasi' ? `/verifikasi/${b._id}` : `/impor/${b._id}`);
        } catch (err) {
          setGalat(pesanGalat(err));
          setMemuat(false);
        }
      }}
    >
      {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
      <Bidang label="Jenis data" htmlFor="jenis" bantuan={info.b}>
        <Pilihan id="jenis" name="jenis" value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS.map((j) => (
            <option key={j.v} value={j.v}>
              {j.l}
            </option>
          ))}
        </Pilihan>
      </Bidang>
      {jenis === 'apbd' &&
        (tahapan ? (
          <Peringatan nada={apbdTerkunci ? 'waspada' : 'info'}>
            Tahapan tujuan: <b>{tahapan.nama}</b>
            {apbdTerkunci && ' — tahapan tidak terbuka, impor ditolak (R10).'}
          </Peringatan>
        ) : (
          <Peringatan nada="waspada">Belum ada tahapan. Buat tahapan terlebih dahulu.</Peringatan>
        ))}
      {jenis === 'verifikasi' &&
        (tahapan ? (
          <Peringatan nada="info">
            Acuan: alokasi di <b>{tahapan.nama}</b> (boleh tahapan yang sudah ditutup).
          </Peringatan>
        ) : (
          <Peringatan nada="waspada">Belum ada tahapan sebagai acuan.</Peringatan>
        ))}
      {jenis === 'nomenklatur' && (
        <Bidang label="Versi nomenklatur" htmlFor="versi" bantuan="Misal 900.1-861-2026. Kosongkan untuk memakai nama file.">
          <Masukan id="versi" name="versi" maxLength={80} />
        </Bidang>
      )}
      {jenis === 'tagging' && (
        <Bidang label="Tahun anggaran" htmlFor="tahun">
          <Masukan id="tahun" name="tahun" type="number" min={2020} max={2100} defaultValue={tahapan?.tahun ?? new Date().getFullYear()} />
        </Bidang>
      )}
      <Bidang label={`File .xlsx atau .csv (maks. ${batasMb} MB)`} htmlFor="file">
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          required
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-garis file:bg-latar file:px-3 file:py-1.5 file:text-sm file:text-teks"
        />
      </Bidang>
      <Tombol type="submit" varian="utama" memuat={memuat} disabled={apbdTerkunci} className="w-full">
        Unggah & proses
      </Tombol>
    </form>
  );
}
