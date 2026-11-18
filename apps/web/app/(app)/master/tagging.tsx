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

interface Calon {
  kode: string;
  nama: string;
  templat: boolean;
}

/**
 * Pilih subkegiatan dari master nomenklatur. Untuk subkegiatan penunjang (X.XX) tagging boleh berlaku untuk semua
 * bidang urusan (kode X.XX disimpan apa adanya) atau satu bidang tertentu (X.XX diganti kode bidang).
 */
function PilihSubkegiatanMaster({ onKode }: { onKode: (kode: string) => void }) {
  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState<Calon[]>([]);
  const [mencari, setMencari] = useState(false);
  const [pilih, setPilih] = useState<Calon | null>(null);
  const [bidang, setBidang] = useState<{ kode: string; nama: string }[]>([]);
  const [kodeBidang, setKodeBidang] = useState('');

  useEffect(() => {
    const q = cari.trim();
    if (pilih || q.length < 2) {
      setHasil([]);
      return;
    }
    let batal = false;
    setMencari(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ data: Calon[] }>(`/api/nomenklatur/subkegiatan?q=${encodeURIComponent(q)}`);
        if (!batal) setHasil(r.data);
      } catch {
        if (!batal) setHasil([]);
      } finally {
        if (!batal) setMencari(false);
      }
    }, 300);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [cari, pilih]);

  useEffect(() => {
    if (pilih?.templat && !bidang.length) api<{ kode: string; nama: string }[]>('/api/nomenklatur/bidang').then(setBidang).catch(() => {});
  }, [pilih, bidang.length]);

  useEffect(() => {
    if (!pilih) onKode('');
    else if (pilih.templat && kodeBidang) onKode([kodeBidang, ...pilih.kode.split('.').slice(2)].join('.'));
    else onKode(pilih.kode);
  }, [pilih, kodeBidang, onKode]);

  return (
    <>
      <Bidang label="Subkegiatan (dari master nomenklatur)" htmlFor="cariSubkegiatan" bantuan={pilih ? undefined : 'Ketik minimal 2 huruf nama atau awal kode, lalu pilih dari daftar.'}>
        {pilih ? (
          <div className="flex items-start justify-between gap-3 rounded-md border border-garis bg-latar px-3 py-2 text-sm">
            <span>
              <span className="font-mono text-xs text-redup">{pilih.kode}</span>
              <span className="block">{pilih.nama}</span>
            </span>
            <Tombol
              type="button"
              kecil
              varian="hantu"
              onClick={() => {
                setPilih(null);
                setKodeBidang('');
              }}
            >
              Ganti
            </Tombol>
          </div>
        ) : (
          <>
            <Masukan id="cariSubkegiatan" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama atau kode subkegiatan" autoComplete="off" />
            {cari.trim().length >= 2 && (
              <ul className="mt-1 max-h-60 overflow-y-auto rounded-md border border-garis text-sm">
                {hasil.map((h) => (
                  <li key={h.kode} className="border-b border-garis last:border-b-0">
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-latar" onClick={() => setPilih(h)}>
                      <span className="font-mono text-xs text-redup">{h.kode}</span>
                      <span className="block">{h.nama}</span>
                    </button>
                  </li>
                ))}
                {!hasil.length && <li className="px-3 py-2 text-redup">{mencari ? 'Mencari…' : 'Tidak ada subkegiatan yang cocok di master nomenklatur.'}</li>}
              </ul>
            )}
          </>
        )}
      </Bidang>
      {pilih?.templat && (
        <Bidang label="Berlaku untuk bidang urusan" htmlFor="kodeBidangTag" bantuan="Subkegiatan penunjang (X.XX): pilih semua bidang, atau satu bidang urusan tertentu.">
          <Pilihan id="kodeBidangTag" value={kodeBidang} onChange={(e) => setKodeBidang(e.target.value)}>
            <option value="">Semua bidang urusan ({pilih.kode})</option>
            {bidang.map((b) => (
              <option key={b.kode} value={b.kode}>
                {b.kode} {b.nama}
              </option>
            ))}
          </Pilihan>
        </Bidang>
      )}
    </>
  );
}

/** Satu koleksi tagging, dua tampilan: dari master sumber dana (sumberDanaId tetap) atau dari nomenklatur (kode tetap). */
export function FormTagging({ tahun, sumberDanaId, kodeSubkegiatan, awal }: { tahun: number; sumberDanaId?: string; kodeSubkegiatan?: string; awal?: Tag }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [sdList, setSdList] = useState<{ _id: string; kode: string; nama: string }[]>([]);
  const [kodeDipilih, setKodeDipilih] = useState('');
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
            if (!awal && !kodeSubkegiatan && !kodeDipilih) return setGalat('Pilih subkegiatan dari master nomenklatur');
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
                  body: { ...isi, tahun, sumberDanaId: sumberDanaId ?? String(fd.get('sumberDanaId')), kodeSubkegiatan: kodeSubkegiatan ?? kodeDipilih },
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
            <PilihSubkegiatanMaster onKode={setKodeDipilih} />
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
