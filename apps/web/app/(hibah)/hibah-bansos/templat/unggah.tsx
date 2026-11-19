'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

export function UnggahTemplat({ ap, skpd }: { ap: boolean; skpd: { _id: string; nama: string }[] }) {
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState('rekomendasi');
  const [galat, setGalat] = useState<string[]>([]);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol varian="utama" onClick={() => setBuka(true)}>
        Unggah templat
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Unggah templat .docx">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (!ap) fd.set('jenis', 'rekomendasi');
            setMemuat(true);
            setGalat([]);
            try {
              await api('/api/hibah/templat', { form: fd });
              toast('Templat diunggah');
              setBuka(false);
              router.refresh();
            } catch (err) {
              const d = err instanceof GalatApi ? (err.detail as unknown as { daftar?: string[] } | undefined)?.daftar : undefined;
              setGalat(d?.length ? d : [pesanGalat(err)]);
            } finally {
              setMemuat(false);
            }
          }}
        >
          {galat.length > 0 && (
            <Peringatan nada="bahaya" judul="Templat belum bisa dipakai">
              <ul className="list-disc pl-4">
                {galat.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Peringatan>
          )}
          {ap && (
            <Bidang label="Jenis" htmlFor="t-jenis">
              <Pilihan id="t-jenis" name="jenis" value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="rekomendasi">Dokumen rekomendasi</option>
                <option value="berita_acara">Berita Acara</option>
                <option value="lampiran">Lampiran I dan II</option>
              </Pilihan>
            </Bidang>
          )}
          {ap && jenis === 'rekomendasi' && (
            <Bidang label="Perangkat Daerah" htmlFor="t-skpd" bantuan="Kosong = templat bawaan untuk PD yang belum punya kop sendiri">
              <Pilihan id="t-skpd" name="skpdId">
                <option value="">Semua PD (bawaan)</option>
                {skpd.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nama}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
          )}
          <Bidang label="Berkas .docx (maks. 2 MB)" htmlFor="t-file">
            <Masukan id="t-file" name="file" type="file" accept=".docx" required />
          </Bidang>
          <div className="flex justify-end">
            <Tombol type="submit" varian="utama" memuat={memuat}>
              Periksa dan unggah
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}
