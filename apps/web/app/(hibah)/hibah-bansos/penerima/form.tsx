'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface OpsiHibah {
  jenis: Data[];
  kecamatan: Data[];
  desa: Data[];
  tujuan: Data[];
  rekening: Data[];
}

/** Kartu calon penerima (FR-12–14): isian menyesuaikan jenis; identitas sama ditolak, nama mirip ditawarkan. */
export function FormPenerima({ opsi, awal, tombol }: { opsi: OpsiHibah; awal?: Data; tombol?: string }) {
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<Data>(() => ({
    jenisPenerimaKode: awal?.jenisPenerimaKode ?? '',
    nama: awal?.nama ?? '',
    identitas: '',
    nomorKk: '',
    alamat: awal?.alamat ?? '',
    kecamatanKode: awal?.kecamatanKode ?? '',
    desaKode: awal?.desaKode ?? '',
    kontak: awal?.kontak ?? '',
    penanggungJawab: awal?.penanggungJawab ?? '',
  }));
  const [ktp, setKtp] = useState<File | null>(null);
  const [kk, setKk] = useState<File | null>(null);
  const [cek, setCek] = useState<{ sama: Data | null; mirip: Data[] }>({ sama: null, mirip: [] });
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const jenis = opsi.jenis.find((j) => j.kode === isi.jenisPenerimaKode);
  const butuhKtp = jenis?.identitas === 'nik' || jenis?.identitas === 'nik_kk';
  const desa = useMemo(() => opsi.desa.filter((d) => d.kecamatanKode === isi.kecamatanKode), [opsi.desa, isi.kecamatanKode]);
  const set = (k: string, v: string) => setIsi((s) => ({ ...s, [k]: v, ...(k === 'kecamatanKode' ? { desaKode: '' } : {}) }));

  useEffect(() => {
    if (awal || !buka) return;
    const t = setTimeout(() => {
      if (!isi.nama.trim() && !isi.identitas.trim()) return setCek({ sama: null, mirip: [] });
      api<{ sama: Data | null; mirip: Data[] }>('/api/hibah/penerima/cek', {
        body: { jenisPenerimaKode: isi.jenisPenerimaKode || undefined, identitas: isi.identitas || undefined, nama: isi.nama || undefined, desaKode: isi.desaKode || undefined },
      })
        .then(setCek)
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [awal, buka, isi.nama, isi.identitas, isi.jenisPenerimaKode, isi.desaKode]);

  return (
    <>
      <Tombol varian={awal ? 'biasa' : 'utama'} onClick={() => setBuka(true)}>
        {tombol ?? (awal ? 'Ubah kartu' : 'Tambah calon penerima')}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${awal.nama}` : 'Calon penerima baru'} lebar="max-w-2xl">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setMemuat(true);
            setGalat({});
            setUmum('');
            const fd = new FormData();
            const data: Data = { ...isi };
            if (!data.identitas) delete data.identitas;
            if (!data.nomorKk) delete data.nomorKk;
            if (awal) data.updatedAt = awal.updatedAt;
            fd.set('data', JSON.stringify(data));
            if (ktp) fd.set('ktp', ktp);
            if (kk) fd.set('kk', kk);
            try {
              const r = await api<Data>(awal ? `/api/hibah/penerima/${awal._id}` : '/api/hibah/penerima', { method: awal ? 'PATCH' : 'POST', form: fd });
              toast('Kartu penerima disimpan');
              setBuka(false);
              if (!awal) router.push(`/hibah-bansos/penerima/${r._id}`);
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
          {cek.sama && (
            <Peringatan nada="bahaya" judul="Identitas sudah terdaftar">
              Kartu <strong>{cek.sama.nama}</strong> ({cek.sama.identitas?.samaran}) sudah ada. Satu identitas hanya boleh satu kartu.{' '}
              <Link href={`/hibah-bansos/usulan/baru?penerima=${cek.sama._id}`} className="font-medium underline">
                Buat usulan dengan kartu ini
              </Link>
            </Peringatan>
          )}
          {!cek.sama && cek.mirip.length > 0 && (
            <Peringatan nada="waspada" judul="Ada kartu dengan nama mirip">
              <ul className="space-y-0.5">
                {cek.mirip.map((m) => (
                  <li key={m._id}>
                    {m.nama} {m.identitas?.samaran && <span className="text-redup">({m.identitas.samaran})</span>} ·{' '}
                    <Link href={`/hibah-bansos/usulan/baru?penerima=${m._id}`} className="underline">
                      pakai kartu ini
                    </Link>
                  </li>
                ))}
              </ul>
            </Peringatan>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Bidang label="Jenis penerima" htmlFor="p-jenis" galat={galat.jenisPenerimaKode}>
              <Pilihan id="p-jenis" value={isi.jenisPenerimaKode} onChange={(e) => set('jenisPenerimaKode', e.target.value)} required>
                <option value="">Pilih…</option>
                <optgroup label="Hibah">
                  {opsi.jenis.filter((j) => j.kelompok === 'hibah').map((j) => (
                    <option key={j.kode} value={j.kode}>
                      {j.nama}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Bantuan sosial">
                  {opsi.jenis.filter((j) => j.kelompok === 'bansos').map((j) => (
                    <option key={j.kode} value={j.kode}>
                      {j.nama}
                    </option>
                  ))}
                </optgroup>
              </Pilihan>
            </Bidang>
            <Bidang label={jenis?.identitas === 'nik_kk' ? 'Nama kepala keluarga' : 'Nama'} htmlFor="p-nama" galat={galat.nama}>
              <Masukan id="p-nama" value={isi.nama} onChange={(e) => set('nama', e.target.value)} required />
            </Bidang>
            <Bidang
              label={butuhKtp ? 'NIK (16 digit)' : jenis?.identitas === 'badan_hukum' ? 'Nomor badan hukum' : 'Nomor identitas (opsional)'}
              htmlFor="p-identitas"
              galat={galat.identitas}
              bantuan={awal ? `Tersimpan: ${awal.identitas?.samaran ?? '–'}. Kosongkan bila tidak diubah.` : 'Disimpan terenkripsi; tampil tersamar di daftar.'}
            >
              <Masukan id="p-identitas" value={isi.identitas} onChange={(e) => set('identitas', e.target.value)} inputMode={butuhKtp ? 'numeric' : undefined} required={butuhKtp && !awal} autoComplete="off" />
            </Bidang>
            {jenis?.identitas === 'nik_kk' && (
              <Bidang label="Nomor KK (16 digit)" htmlFor="p-kk" galat={galat.nomorKk}>
                <Masukan id="p-kk" value={isi.nomorKk} onChange={(e) => set('nomorKk', e.target.value)} inputMode="numeric" required={!awal} autoComplete="off" />
              </Bidang>
            )}
            {jenis?.kelompok === 'hibah' && jenis?.identitas !== 'nik' && (
              <Bidang label="Pimpinan / penanggung jawab" htmlFor="p-pj">
                <Masukan id="p-pj" value={isi.penanggungJawab} onChange={(e) => set('penanggungJawab', e.target.value)} />
              </Bidang>
            )}
            {jenis?.kode === 'B03' && (
              <Bidang label="Ketua kelompok" htmlFor="p-ketua">
                <Masukan id="p-ketua" value={isi.penanggungJawab} onChange={(e) => set('penanggungJawab', e.target.value)} />
              </Bidang>
            )}
            <Bidang label="Kecamatan" htmlFor="p-kec" galat={galat.kecamatanKode}>
              <Pilihan id="p-kec" value={isi.kecamatanKode} onChange={(e) => set('kecamatanKode', e.target.value)}>
                <option value="">Pilih…</option>
                {opsi.kecamatan.map((k) => (
                  <option key={k.kode} value={k.kode}>
                    {k.nama}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
            <Bidang label="Kelurahan/desa" htmlFor="p-desa" galat={galat.desaKode}>
              <Pilihan id="p-desa" value={isi.desaKode} onChange={(e) => set('desaKode', e.target.value)} disabled={!isi.kecamatanKode}>
                <option value="">Pilih…</option>
                {desa.map((d) => (
                  <option key={d.kode} value={d.kode}>
                    {d.jenis === 'kelurahan' ? 'Kel.' : 'Desa'} {d.nama}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
            <Bidang label="Alamat (jalan, RT/RW)" htmlFor="p-alamat">
              <Masukan id="p-alamat" value={isi.alamat} onChange={(e) => set('alamat', e.target.value)} />
            </Bidang>
            <Bidang label="Kontak" htmlFor="p-kontak">
              <Masukan id="p-kontak" value={isi.kontak} onChange={(e) => set('kontak', e.target.value)} />
            </Bidang>
            {butuhKtp && (
              <Bidang label={awal ? 'Ganti KTP (opsional)' : 'Unggah KTP (wajib)'} htmlFor="p-ktp" galat={galat.ktp} bantuan="PDF, JPG, atau PNG, maks. 5 MB">
                <Masukan id="p-ktp" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setKtp(e.target.files?.[0] ?? null)} required={!awal} />
              </Bidang>
            )}
            {jenis?.identitas === 'nik_kk' && (
              <Bidang label={awal ? 'Ganti KK (opsional)' : 'Unggah KK (wajib)'} htmlFor="p-kkf" galat={galat.kk} bantuan="PDF, JPG, atau PNG, maks. 5 MB">
                <Masukan id="p-kkf" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setKk(e.target.files?.[0] ?? null)} required={!awal} />
              </Bidang>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama" memuat={memuat} disabled={!!cek.sama}>
              Simpan kartu
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
