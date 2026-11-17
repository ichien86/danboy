'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, bacaAngka, pesanGalat, tulisAngka } from '@/lib/klien';

interface Skpd {
  id: string;
  kode: string;
  nama: string;
  subUnit: { id: string; nama: string }[];
}
interface Calon {
  kode: string;
  nama: string;
  templat: boolean;
}
interface Info {
  kode: string;
  tagging: { sumberDanaId: string; sumberDana: string; kategori: string; rincian: string }[];
  sudahAda: string[];
}

export function FormTambahSubkegiatan({
  tahapanId,
  skpd,
  sumberDana,
  bidang,
}: {
  tahapanId: string;
  skpd: Skpd[];
  sumberDana: { id: string; nama: string }[];
  bidang: { kode: string; nama: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [skpdId, setSkpdId] = useState('');
  const [subUnitId, setSubUnitId] = useState('');
  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState<Calon[]>([]);
  const [mencari, setMencari] = useState(false);
  const [pilih, setPilih] = useState<Calon | null>(null);
  const [kodeBidang, setKodeBidang] = useState('');
  const [pagu, setPagu] = useState('');
  const [sumberDanaId, setSumberDanaId] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);

  const skpdDipilih = skpd.find((s) => s.id === skpdId);
  const subUnit = skpdDipilih?.subUnit ?? [];
  // kode akhir: kode master, atau X.XX diganti bidang urusan yang dipilih
  const kodeAkhir = useMemo(() => {
    if (!pilih) return '';
    if (!pilih.templat) return pilih.kode;
    return kodeBidang ? [kodeBidang, ...pilih.kode.split('.').slice(2)].join('.') : '';
  }, [pilih, kodeBidang]);

  // pencarian subkegiatan di master nomenklatur
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
        const r = await api<{ data: Calon[] }>(`/api/tahapan/${tahapanId}/subkegiatan/calon?q=${encodeURIComponent(q)}`);
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
  }, [cari, pilih, tahapanId]);

  // info tagging untuk kode akhir
  useEffect(() => {
    setInfo(null);
    if (!kodeAkhir) return;
    let batal = false;
    api<Info>(`/api/tahapan/${tahapanId}/subkegiatan/calon?kode=${encodeURIComponent(kodeAkhir)}`)
      .then((r) => !batal && setInfo(r))
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, [kodeAkhir, tahapanId]);

  const pilihSkpd = (id: string) => {
    setSkpdId(id);
    const s = skpd.find((x) => x.id === id);
    setSubUnitId(s?.subUnit.length === 1 ? s.subUnit[0].id : '');
    // bidang urusan bawaan = dua segmen pertama kode SKPD
    const b = s?.kode.split('.').slice(0, 2).join('.');
    if (b && bidang.some((x) => x.kode === b)) setKodeBidang(b);
  };

  const taggingSd = [...new Map((info?.tagging ?? []).map((t) => [t.sumberDanaId, t.sumberDana])).entries()];
  const duplikat = !!info && !!subUnitId && info.sudahAda.includes(subUnitId);
  const nilaiPagu = bacaAngka(pagu);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!pilih) return setGalat('Pilih subkegiatan dari master nomenklatur');
        if (pilih.templat && !kodeBidang) return setGalat('Pilih bidang urusan pengganti X.XX');
        if (nilaiPagu === null) return setGalat('Isi pagu (boleh 0)');
        setMemuat(true);
        setGalat('');
        try {
          const r = await api<{ dokumen: { _id: string; kodeSubkegiatan: string } }>(`/api/tahapan/${tahapanId}/subkegiatan`, {
            body: { subUnitId, kodeNomenklatur: pilih.kode, kodeBidang: pilih.templat ? kodeBidang : null, pagu: nilaiPagu, sumberDanaId: sumberDanaId || null },
          });
          toast(`Subkegiatan ${r.dokumen.kodeSubkegiatan} ditambahkan`);
          router.push(`/subkegiatan?q=${encodeURIComponent(r.dokumen.kodeSubkegiatan)}&id=${r.dokumen._id}`);
          router.refresh();
        } catch (err) {
          setGalat(pesanGalat(err));
          setMemuat(false);
        }
      }}
    >
      {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="SKPD" htmlFor="skpd">
          <Pilihan id="skpd" value={skpdId} onChange={(e) => pilihSkpd(e.target.value)} required>
            <option value="">Pilih SKPD</option>
            {skpd.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </Pilihan>
        </Bidang>
        <Bidang label="Sub unit" htmlFor="subUnit">
          <Pilihan id="subUnit" value={subUnitId} onChange={(e) => setSubUnitId(e.target.value)} required disabled={!skpdId}>
            <option value="">{skpdId ? 'Pilih sub unit' : 'Pilih SKPD dahulu'}</option>
            {subUnit.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </Pilihan>
        </Bidang>
      </div>

      <Bidang label="Subkegiatan (dari master nomenklatur)" htmlFor="cari" bantuan={pilih ? undefined : 'Ketik minimal 2 huruf nama atau awal kode, lalu pilih dari daftar.'}>
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
                setInfo(null);
              }}
            >
              Ganti
            </Tombol>
          </div>
        ) : (
          <>
            <Masukan id="cari" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama atau kode subkegiatan" autoComplete="off" />
            {cari.trim().length >= 2 && (
              <ul className="mt-1 max-h-72 overflow-y-auto rounded-md border border-garis text-sm">
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
        <Bidang
          label="Bidang urusan (pengganti X.XX)"
          htmlFor="bidang"
          bantuan="Subkegiatan penunjang ditulis X.XX di master; kodenya mengikuti bidang urusan yang dipilih. Bawaannya bidang urusan SKPD."
        >
          <Pilihan id="bidang" value={kodeBidang} onChange={(e) => setKodeBidang(e.target.value)} required>
            <option value="">Pilih bidang urusan</option>
            {bidang.map((b) => (
              <option key={b.kode} value={b.kode}>
                {b.kode} — {b.nama}
              </option>
            ))}
          </Pilihan>
        </Bidang>
      )}

      {kodeAkhir && (
        <p className="text-sm">
          Kode subkegiatan yang akan dibuat: <strong className="font-mono">{kodeAkhir}</strong>
        </p>
      )}

      {info && taggingSd.length > 0 && (
        <Peringatan nada="info" judul="Subkegiatan ini termasuk daftar tagging">
          <p>Ditandai untuk sumber dana berikut:</p>
          <ul className="mt-1 list-disc pl-5">
            {taggingSd.map(([id, nama]) => (
              <li key={id}>
                {nama}{' '}
                <button type="button" className="underline" onClick={() => setSumberDanaId(id)}>
                  pakai sebagai sumber dana
                </button>
              </li>
            ))}
          </ul>
        </Peringatan>
      )}
      {info && taggingSd.length === 0 && <p className="text-sm text-redup">Subkegiatan ini tidak termasuk daftar tagging.</p>}
      {duplikat && <Peringatan nada="bahaya">Subkegiatan {kodeAkhir} sudah ada di sub unit ini.</Peringatan>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Pagu (Rp)" htmlFor="pagu">
          <Masukan id="pagu" inputMode="numeric" value={pagu} onChange={(e) => setPagu(tulisAngka(bacaAngka(e.target.value)))} placeholder="0" required />
        </Bidang>
        <Bidang label="Sumber dana" htmlFor="sumberDana" bantuan="Seluruh pagu dialokasikan ke sumber dana ini. Boleh dikosongkan dan diisi belakangan.">
          <Pilihan id="sumberDana" value={sumberDanaId} onChange={(e) => setSumberDanaId(e.target.value)}>
            <option value="">Belum ditentukan</option>
            {sumberDana.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </Pilihan>
        </Bidang>
      </div>

      <div className="flex justify-end gap-2">
        <Tombol type="button" onClick={() => router.push('/subkegiatan')}>
          Batal
        </Tombol>
        <Tombol type="submit" varian="utama" memuat={memuat} disabled={duplikat}>
          Tambah subkegiatan
        </Tombol>
      </div>
    </form>
  );
}
