'use client';

import { DatabaseZap, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Kartu, Tombol, cx } from '@/components/ui';
import { api, pesanGalat, rp } from '@/lib/klien';
import { angka } from '@/lib/angka';

interface Rujukan {
  kode: string;
  nama: string;
  baris: number;
  pagu: number;
  kodeSkpd?: string;
}
interface Beda {
  kode: string;
  namaMaster: string;
  namaFile: string;
  catatan?: string;
}
export interface Izin {
  nomenklatur: boolean;
  sumberDana: boolean;
  skpd: boolean;
}

const KELOMPOK = [
  { kunci: 'subkegiatan', judul: 'Subkegiatan belum ada di master nomenklatur', kategori: 'subkegiatan', izin: 'nomenklatur', pengelola: 'Super Admin' },
  { kunci: 'sumberDana', judul: 'Sumber dana belum ada di master', kategori: 'sumber_dana', izin: 'sumberDana', pengelola: 'Admin Keuangan' },
  { kunci: 'skpd', judul: 'SKPD belum ada di master perangkat daerah', kategori: 'perangkat_daerah', izin: 'skpd', pengelola: 'Super Admin' },
  { kunci: 'subUnit', judul: 'Sub unit belum ada di master perangkat daerah', kategori: 'perangkat_daerah', izin: 'skpd', pengelola: 'Super Admin' },
] as const;

/**
 * Rujukan impor APBD yang belum ada di master. Barisnya ditahan agar data tetap saling terhubung;
 * yang berwenang bisa menambahkannya ke master (memakai kode & nama dari file) lalu impor diproses ulang.
 */
export function PanelRujukan({
  batchId,
  rujukan,
  perbedaan,
  izin,
  bisaUbah,
  onBerubah,
}: {
  batchId: string;
  rujukan?: Record<string, Rujukan[]>;
  perbedaan?: { skpd: Beda[]; subUnit: Beda[] };
  izin: Izin;
  bisaUbah: boolean;
  onBerubah: () => void;
}) {
  const [konfirmasi, setKonfirmasi] = useState<(typeof KELOMPOK)[number] | null>(null);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const ada = KELOMPOK.filter((k) => (rujukan?.[k.kunci]?.length ?? 0) > 0);
  const beda = [...(perbedaan?.skpd ?? []).map((x) => ({ ...x, jenis: 'SKPD' })), ...(perbedaan?.subUnit ?? []).map((x) => ({ ...x, jenis: 'Sub unit' }))];
  if (!ada.length && !beda.length) return null;

  const daftarKategori = (k: (typeof KELOMPOK)[number]) =>
    k.kategori === 'perangkat_daerah' ? [...(rujukan?.skpd ?? []), ...(rujukan?.subUnit ?? [])] : (rujukan?.[k.kunci] ?? []);

  return (
    <div id="rujukan" className="mb-4 space-y-4">
      {ada.length > 0 && (
        <Kartu
          padat
          judul={
            <span className="flex items-center gap-2 text-waspada">
              <TriangleAlert className="size-4" aria-hidden /> Rujukan belum ada di master — barisnya ditahan
            </span>
          }
        >
          <p className="border-b border-garis px-4 py-2.5 text-sm text-redup">
            Agar data tetap saling terhubung, baris yang merujuk kode di bawah ini tidak diimpor. Tambahkan dulu ke master (lewat tombol di bawah
            atau oleh pengelolanya), lalu impor diproses ulang otomatis. Bisa juga diterapkan tanpa baris tersebut setelah konfirmasi.
          </p>
          <div className="divide-y divide-garis">
            {ada.map((k) => {
              const boleh = izin[k.izin];
              const tampilTombol = bisaUbah && boleh && (k.kunci !== 'subUnit' || !(rujukan?.skpd?.length ?? 0));
              return (
                <section key={k.kunci} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {k.judul} <span className="font-normal text-redup">({rujukan![k.kunci].length})</span>
                    </h3>
                    {tampilTombol ? (
                      <Tombol kecil varian="utama" onClick={() => setKonfirmasi(k)}>
                        <DatabaseZap className="size-3.5" aria-hidden /> Tambahkan ke master
                      </Tombol>
                    ) : (
                      !boleh && <span className="text-xs text-redup">Dikelola {k.pengelola}</span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rujukan![k.kunci].slice(0, 30).map((x) => (
                      <li key={x.kode} className="flex flex-wrap justify-between gap-x-3">
                        <span>
                          <span className="font-mono text-xs text-redup">{x.kode}</span> {x.nama}
                        </span>
                        <span className="text-xs text-redup">
                          {x.baris} baris · {rp(x.pagu)}
                        </span>
                      </li>
                    ))}
                    {rujukan![k.kunci].length > 30 && <li className="text-xs text-redup">… dan {rujukan![k.kunci].length - 30} lainnya</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </Kartu>
      )}

      {beda.length > 0 && (
        <Kartu padat judul={<span className="text-info">Nama perangkat daerah di SIPD berbeda dengan master ({angka(beda.length)})</span>}>
          <p className="border-b border-garis px-4 py-2.5 text-sm text-redup">
            Baris tetap diimpor dan ditautkan menurut kode di master; nama di master tidak diubah. Bila nama di SIPD yang benar, Super Admin
            dapat memperbaikinya di Master → Perangkat Daerah atau mengimpor ulang data perangkat daerah.
          </p>
          <ul className="divide-y divide-garis text-sm">
            {beda.map((x) => (
              <li key={x.kode} className="px-4 py-2">
                <span className="font-mono text-xs text-redup">
                  {x.jenis} {x.kode}
                </span>
                <div className="mt-0.5 grid gap-1 sm:grid-cols-2">
                  <span>
                    <span className="text-xs text-redup">Master: </span>
                    {x.namaMaster}
                  </span>
                  <span className={cx('font-medium')}>
                    <span className="text-xs font-normal text-redup">SIPD: </span>
                    {x.namaFile}
                  </span>
                </div>
                {x.catatan && <p className="mt-0.5 text-xs text-waspada">{x.catatan}</p>}
              </li>
            ))}
          </ul>
        </Kartu>
      )}

      <Modal buka={!!konfirmasi} setBuka={(b) => !b && setKonfirmasi(null)} judul="Tambahkan ke master?">
        {konfirmasi && (
          <div className="space-y-3 text-sm">
            <p>
              {daftarKategori(konfirmasi).length} data berikut akan ditambahkan ke master memakai kode dan nama dari file SIPD
              {konfirmasi.kategori === 'subkegiatan' && ' (beserta kegiatan/program induknya bila belum ada)'}. Setelah itu impor diproses ulang.
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md bg-latar px-3 py-2">
              {daftarKategori(konfirmasi).map((x) => (
                <li key={x.kode}>
                  <span className="font-mono text-xs text-redup">{x.kode}</span> {x.nama}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <Tombol onClick={() => setKonfirmasi(null)}>Batal</Tombol>
              <Tombol
                varian="utama"
                memuat={memuat}
                onClick={async () => {
                  setMemuat(true);
                  try {
                    const r = await api<{ ditambahkan: number }>(`/api/impor/${batchId}/lengkapi`, { body: { kategori: konfirmasi.kategori } });
                    toast(`${r.ditambahkan} data ditambahkan ke master; impor diproses ulang`);
                    setKonfirmasi(null);
                    onBerubah();
                  } catch (e) {
                    toast(pesanGalat(e), 'bahaya');
                  } finally {
                    setMemuat(false);
                  }
                }}
              >
                Ya, tambahkan
              </Tombol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
