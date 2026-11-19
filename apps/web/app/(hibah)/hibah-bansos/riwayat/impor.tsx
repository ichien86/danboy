'use client';

import { Download, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Lencana, Peringatan, Tabel, TD, TH, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Impor riwayat penerima atau wilayah: unggah → pratinjau (diproses, ditahan beserta alasan) → terapkan (FR-09, FR-10). */
export function ImporHibah({ jenis }: { jenis: 'riwayat' | 'wilayah' }) {
  const ref = useRef<HTMLInputElement>(null);
  const [memuat, setMemuat] = useState(false);
  const [hasil, setHasil] = useState<Data | null>(null);
  const [tab, setTab] = useState<'ditahan' | 'diproses' | 'catatan'>('ditahan');
  const toast = useToast();
  const router = useRouter();
  const label = jenis === 'riwayat' ? 'riwayat penerima' : 'wilayah';
  return (
    <>
      <a href={`/api/hibah/impor/templat/${jenis}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-garis px-3 text-sm hover:bg-latar">
        <Download className="size-3.5" aria-hidden /> Templat Excel
      </a>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const fd = new FormData();
          fd.set('file', f);
          fd.set('jenis', jenis);
          setMemuat(true);
          try {
            const r = await api<Data>('/api/hibah/impor', { form: fd });
            setTab(r.jumlahDitahan ? 'ditahan' : 'diproses');
            setHasil(r);
          } catch (err) {
            toast(pesanGalat(err), 'bahaya');
          } finally {
            setMemuat(false);
          }
        }}
      />
      <Tombol varian="utama" memuat={memuat} onClick={() => ref.current?.click()}>
        <Upload className="size-3.5" aria-hidden /> Impor {label}
      </Tombol>
      <Modal buka={!!hasil} setBuka={(b) => !b && setHasil(null)} judul={`Pratinjau impor ${label}`} lebar="max-w-4xl" deskripsi={hasil?.namaFile}>
        {hasil && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Lencana nada="aman">{hasil.jumlahDiproses} baris diproses</Lencana>
              <Lencana nada={hasil.jumlahDitahan ? 'bahaya' : 'netral'}>{hasil.jumlahDitahan} baris ditahan</Lencana>
              {hasil.tahun && <Lencana>TA {hasil.tahun}</Lencana>}
            </div>
            {jenis === 'riwayat' && hasil.jumlahLama > 0 && (
              <Peringatan nada="waspada" judul={`Mengganti seluruh riwayat TA ${hasil.tahun}`}>
                Ada {hasil.jumlahLama} baris riwayat TA {hasil.tahun} yang akan dihapus dan diganti isi berkas ini.
              </Peringatan>
            )}
            <div className="flex gap-1 border-b border-garis">
              {(['ditahan', 'diproses', 'catatan'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm ${tab === t ? 'border-b-2 border-utama font-medium' : 'text-redup'}`}>
                  {t === 'ditahan' ? 'Ditahan' : t === 'diproses' ? 'Diproses (contoh 50)' : 'Catatan'}
                </button>
              ))}
            </div>
            <div className="max-h-80 overflow-auto">
              <Tabel>
                <thead>
                  <tr>
                    <TH>Baris</TH>
                    <TH>{tab === 'ditahan' ? 'Alasan' : tab === 'catatan' ? 'Pesan' : 'Isi'}</TH>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'ditahan' ? hasil.ditahan : tab === 'catatan' ? hasil.catatan : hasil.contohDiproses).map((b: Data, i: number) => (
                    <tr key={i}>
                      <TD className="align-top">{b.baris}</TD>
                      <TD>
                        {tab === 'ditahan' ? (
                          <span className="text-bahaya">{b.alasan}</span>
                        ) : tab === 'catatan' ? (
                          b.pesan
                        ) : jenis === 'riwayat' ? (
                          `${b.nama} · ${b.namaPd} · ${b.bentuk} · Rp${new Intl.NumberFormat('id-ID').format(b.nilai)}${b.samaran ? ` · ${b.samaran}` : ''}`
                        ) : (
                          `${b.kecamatanNama} · ${b.nama} (${b.jenis})`
                        )}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </Tabel>
            </div>
            <div className="flex justify-end gap-2">
              <Tombol
                onClick={async () => {
                  await api(`/api/hibah/impor/${hasil._id}`, { method: 'DELETE' }).catch(() => undefined);
                  setHasil(null);
                }}
              >
                Batal
              </Tombol>
              <Tombol
                varian="utama"
                disabled={!hasil.jumlahDiproses}
                memuat={memuat}
                onClick={async () => {
                  if (jenis === 'riwayat' && hasil.jumlahLama > 0 && !confirm(`Ganti ${hasil.jumlahLama} baris riwayat TA ${hasil.tahun}?`)) return;
                  setMemuat(true);
                  try {
                    const r = await api<Data>(`/api/hibah/impor/${hasil._id}/terapkan`, { method: 'POST', body: {} });
                    toast(jenis === 'riwayat' ? `${r.disimpan} baris riwayat disimpan` : `${r.kecamatanBerubah} kecamatan dan ${r.desaBerubah} desa diperbarui`);
                    setHasil(null);
                    router.refresh();
                  } catch (err) {
                    toast(pesanGalat(err), 'bahaya');
                  } finally {
                    setMemuat(false);
                  }
                }}
              >
                Terapkan {hasil.jumlahDiproses} baris
              </Tombol>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
