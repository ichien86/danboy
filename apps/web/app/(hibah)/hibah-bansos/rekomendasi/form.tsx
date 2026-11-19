'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Tabel, TD, TH, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat, rp } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Buat atau ubah dokumen rekomendasi (FR-25): pilih usulan Layak milik PD, isi nomor, tanggal, Kepala PD. */
export function FormRekomendasi({ awal, tombol }: { awal?: Data; tombol?: string }) {
  const [buka, setBuka] = useState(false);
  const [layak, setLayak] = useState<Data[]>([]);
  const [pilih, setPilih] = useState<string[]>(() => (awal?.usulan ?? []).map((u: Data) => u._id));
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (buka) api<Data[]>('/api/hibah/rekomendasi/layak').then(setLayak).catch(() => setLayak([]));
  }, [buka]);
  const daftar = [...(awal?.usulan ?? []), ...layak.filter((l) => !(awal?.usulan ?? []).some((u: Data) => u._id === l._id))];
  const total = daftar.filter((u) => pilih.includes(u._id)).reduce((a, u) => ({ usulan: a.usulan + u.nilaiUsulan, rek: a.rek + u.nilaiRekomendasi }), { usulan: 0, rek: 0 });
  return (
    <>
      <Tombol varian={awal ? 'biasa' : 'utama'} onClick={() => setBuka(true)}>
        {tombol ?? (awal ? 'Ubah dokumen' : 'Buat dokumen rekomendasi')}
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah rekomendasi ${awal.nomor}` : 'Dokumen rekomendasi baru'} lebar="max-w-3xl">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Data = {
              nomor: fd.get('nomor'),
              tanggal: new Date(`${fd.get('tanggal')}T00:00:00+07:00`).toISOString(),
              perihal: fd.get('perihal'),
              kepalaPdNama: fd.get('kepalaPdNama'),
              kepalaPdNip: fd.get('kepalaPdNip'),
              usulanIds: pilih,
            };
            setMemuat(true);
            setGalat({});
            setUmum('');
            try {
              const r = awal
                ? await api<Data>(`/api/hibah/rekomendasi/${awal._id}`, { method: 'PATCH', body: { ...body, updatedAt: awal.updatedAt } })
                : await api<Data>('/api/hibah/rekomendasi', { body });
              toast('Dokumen rekomendasi disimpan');
              setBuka(false);
              if (!awal) router.push(`/hibah-bansos/rekomendasi/${r._id}`);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Bidang label="Nomor surat" htmlFor="r-nomor" galat={galat.nomor}>
              <Masukan id="r-nomor" name="nomor" defaultValue={awal?.nomor} required />
            </Bidang>
            <Bidang label="Tanggal" htmlFor="r-tgl">
              <Masukan id="r-tgl" name="tanggal" type="date" defaultValue={awal?.tanggal ? String(awal.tanggal).slice(0, 10) : new Date().toISOString().slice(0, 10)} required />
            </Bidang>
            <Bidang label="Perihal" htmlFor="r-perihal">
              <Masukan id="r-perihal" name="perihal" defaultValue={awal?.perihal ?? 'Rekomendasi Calon Penerima Hibah dan Bantuan Sosial'} />
            </Bidang>
            <div />
            <Bidang label="Nama Kepala PD" htmlFor="r-kepala">
              <Masukan id="r-kepala" name="kepalaPdNama" defaultValue={awal?.kepalaPd?.nama} />
            </Bidang>
            <Bidang label="NIP Kepala PD" htmlFor="r-nip">
              <Masukan id="r-nip" name="kepalaPdNip" defaultValue={awal?.kepalaPd?.nip} />
            </Bidang>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Usulan berstatus Layak {galat.usulanIds && <span className="text-xs font-normal text-bahaya">· {galat.usulanIds}</span>}</p>
            <div className="max-h-64 overflow-auto rounded-md border border-garis">
              <Tabel>
                <thead>
                  <tr>
                    <TH />
                    <TH>Nomor</TH>
                    <TH>Penerima</TH>
                    <TH kanan>Usulan</TH>
                    <TH kanan>Rekomendasi</TH>
                  </tr>
                </thead>
                <tbody>
                  {daftar.map((u) => (
                    <tr key={u._id}>
                      <TD>
                        <input type="checkbox" checked={pilih.includes(u._id)} onChange={(e) => setPilih((p) => (e.target.checked ? [...p, u._id] : p.filter((x) => x !== u._id)))} aria-label={`Pilih ${u.nomor}`} />
                      </TD>
                      <TD className="whitespace-nowrap">{u.nomor}</TD>
                      <TD>{u.namaPenerima}</TD>
                      <TD kanan className="whitespace-nowrap">
                        {rp(u.nilaiUsulan)}
                      </TD>
                      <TD kanan className="whitespace-nowrap">
                        {rp(u.nilaiRekomendasi)}
                      </TD>
                    </tr>
                  ))}
                  {!daftar.length && (
                    <tr>
                      <TD colSpan={5} className="py-6 text-center text-redup">
                        Belum ada usulan Layak yang belum masuk dokumen rekomendasi.
                      </TD>
                    </tr>
                  )}
                </tbody>
              </Tabel>
            </div>
            <p className="mt-1 text-xs text-redup">
              {pilih.length} usulan dipilih · usulan {rp(total.usulan)} · rekomendasi {rp(total.rek)}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama" memuat={memuat} disabled={!pilih.length}>
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
