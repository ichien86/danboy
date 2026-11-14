'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Masukan, Peringatan, Tombol, cx } from '@/components/ui';
import { api, bacaAngka, pesanGalat, rp, tulisAngka } from '@/lib/klien';

interface Baris {
  sumberDanaId: string;
  kode: string;
  nama: string;
  khusus: boolean;
  nilai: number | null;
  terpakai: number;
}

/** Pagu sumber dana diisi manual sebagai batas pemantauan; tidak mengunci (pelanggaran memicu R3). */
export function FormPagu({ tahapanId }: { tahapanId: string }) {
  const [buka, setBuka] = useState(false);
  const [baris, setBaris] = useState<(Baris & { teks: string })[]>([]);
  const [q, setQ] = useState('');
  const [hanyaTerpakai, setHanyaTerpakai] = useState(true);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();

  const muat = async () => {
    setGalat('');
    try {
      const d = await api<Baris[]>(`/api/tahapan/${tahapanId}/pagu-sumber-dana`);
      setBaris(d.map((x) => ({ ...x, teks: tulisAngka(x.nilai) })));
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  };
  const tampil = baris.filter(
    (b) => (!hanyaTerpakai || b.terpakai > 0 || b.nilai !== null) && (!q || `${b.kode} ${b.nama}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <Tombol
        varian="utama"
        onClick={() => {
          setBuka(true);
          muat();
        }}
      >
        Isi pagu sumber dana
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Pagu sumber dana" deskripsi="Batas pemantauan per sumber dana pada tahapan ini. Kosongkan untuk menghapus." lebar="max-w-3xl">
        {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Masukan placeholder="Cari kode atau nama…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Cari sumber dana" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hanyaTerpakai} onChange={(e) => setHanyaTerpakai(e.target.checked)} />
            Hanya yang terpakai / sudah berpagu
          </label>
        </div>
        <div className="divide-y divide-garis rounded-md border border-garis">
          {tampil.map((b) => {
            const nilai = bacaAngka(b.teks);
            const lebih = nilai !== null && b.terpakai > nilai;
            return (
              <div key={b.sumberDanaId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{b.nama}</p>
                  <p className="text-xs text-redup">
                    <span className="font-mono">{b.kode}</span> · terpakai {rp(b.terpakai)}
                  </p>
                </div>
                <div>
                  <input
                    inputMode="numeric"
                    aria-label={`Pagu ${b.nama}`}
                    value={b.teks}
                    placeholder="Belum diisi"
                    onChange={(e) => setBaris((x) => x.map((y) => (y.sumberDanaId === b.sumberDanaId ? { ...y, teks: tulisAngka(bacaAngka(e.target.value)) } : y)))}
                    className={cx('angka h-9 w-full rounded-md border bg-permukaan px-3 text-right text-sm sm:w-52', lebih ? 'border-bahaya' : 'border-garis')}
                  />
                  {lebih && <p className="mt-0.5 text-right text-xs text-bahaya">Terpakai melebihi pagu</p>}
                </div>
              </div>
            );
          })}
          {!tampil.length && <p className="px-3 py-6 text-center text-sm text-redup">Tidak ada sumber dana</p>}
        </div>
        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 bg-permukaan pt-2">
          <Tombol onClick={() => setBuka(false)}>Batal</Tombol>
          <Tombol
            varian="utama"
            memuat={memuat}
            onClick={async () => {
              setMemuat(true);
              try {
                await api(`/api/tahapan/${tahapanId}/pagu-sumber-dana`, {
                  method: 'PUT',
                  body: { pagu: baris.map((b) => ({ sumberDanaId: b.sumberDanaId, nilai: bacaAngka(b.teks) })) },
                });
                toast('Pagu sumber dana disimpan');
                setBuka(false);
                router.refresh();
              } catch (e) {
                setGalat(pesanGalat(e));
              } finally {
                setMemuat(false);
              }
            }}
          >
            Simpan pagu
          </Tombol>
        </div>
      </Modal>
    </>
  );
}
