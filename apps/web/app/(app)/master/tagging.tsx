'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

interface Tag {
  _id: string;
  kodeSubkegiatan: string;
  kategori: string;
  rincian: string;
  kinerja?: string;
  indikator?: string;
  satuan?: string;
}

/** Satu koleksi tagging, dua tampilan: dari master sumber dana (sumberDanaId tetap) atau dari nomenklatur (kode tetap). */
export function FormTagging({ tahun, sumberDanaId, kodeSubkegiatan, awal }: { tahun: number; sumberDanaId?: string; kodeSubkegiatan?: string; awal?: Tag }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [sdList, setSdList] = useState<{ _id: string; kode: string; nama: string }[]>([]);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (buka && !sumberDanaId) api<{ _id: string; kode: string; nama: string }[]>('/api/sumber-dana?khusus=true').then(setSdList).catch(() => {});
  }, [buka, sumberDanaId]);

  return (
    <>
      {awal ? (
        <Tombol kecil varian="hantu" onClick={() => setBuka(true)}>
          Ubah
        </Tombol>
      ) : (
        <Tombol kecil varian="utama" onClick={() => setBuka(true)}>
          Tambah tagging
        </Tombol>
      )}
      <Modal buka={buka} setBuka={setBuka} judul={awal ? 'Ubah tagging' : `Tambah tagging ${tahun}`}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const isi = {
              kategori: String(fd.get('kategori') ?? ''),
              rincian: String(fd.get('rincian') ?? ''),
              kinerja: String(fd.get('kinerja') ?? '') || undefined,
              indikator: String(fd.get('indikator') ?? '') || undefined,
              satuan: String(fd.get('satuan') ?? '') || undefined,
            };
            setMemuat(true);
            setGalat('');
            try {
              if (awal) await api(`/api/tagging/${awal._id}`, { method: 'PATCH', body: isi });
              else
                await api('/api/tagging', {
                  body: { ...isi, tahun, sumberDanaId: sumberDanaId ?? String(fd.get('sumberDanaId')), kodeSubkegiatan: kodeSubkegiatan ?? String(fd.get('kodeSubkegiatan')).trim() },
                });
              toast('Tagging disimpan');
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
          {!awal && !kodeSubkegiatan && (
            <Bidang label="Kode subkegiatan" htmlFor="kodeSubkegiatan">
              <Masukan id="kodeSubkegiatan" name="kodeSubkegiatan" placeholder="1.01.02.2.01.0001" required />
            </Bidang>
          )}
          {!awal && !sumberDanaId && (
            <Bidang label="Sumber dana khusus" htmlFor="sumberDanaId">
              <Pilihan id="sumberDanaId" name="sumberDanaId" required>
                <option value="">Pilih…</option>
                {sdList.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.nama}
                  </option>
                ))}
              </Pilihan>
            </Bidang>
          )}
          <Bidang label="Kategori / Bidang › Program" htmlFor="kategori">
            <Masukan id="kategori" name="kategori" defaultValue={awal?.kategori} />
          </Bidang>
          <Bidang label="Rincian / Subbidang" htmlFor="rincian">
            <Masukan id="rincian" name="rincian" defaultValue={awal?.rincian} disabled={!!awal} />
          </Bidang>
          <div className="grid gap-3 sm:grid-cols-3">
            <Bidang label="Kinerja" htmlFor="kinerja">
              <Masukan id="kinerja" name="kinerja" defaultValue={awal?.kinerja} />
            </Bidang>
            <Bidang label="Indikator" htmlFor="indikator">
              <Masukan id="indikator" name="indikator" defaultValue={awal?.indikator} />
            </Bidang>
            <Bidang label="Satuan" htmlFor="satuan">
              <Masukan id="satuan" name="satuan" defaultValue={awal?.satuan} />
            </Bidang>
          </div>
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

export function HapusTagging({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  return (
    <Tombol
      kecil
      varian="hantu"
      className="text-bahaya"
      onClick={async () => {
        if (!confirm('Hapus tagging ini?')) return;
        try {
          await api(`/api/tagging/${id}`, { method: 'DELETE' });
          toast('Tagging dihapus');
          router.refresh();
        } catch (e) {
          toast(pesanGalat(e), 'bahaya');
        }
      }}
    >
      Hapus
    </Tombol>
  );
}
