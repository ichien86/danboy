'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { AreaTeks, Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, pesanGalat } from '@/lib/klien';

/** Nilai untuk input datetime-local dalam zona Asia/Jakarta. */
const keLokal = (d?: string | Date) => {
  const t = d ? new Date(d) : new Date();
  const wib = new Date(t.getTime() + 7 * 3600_000);
  return wib.toISOString().slice(0, 16);
};
const dariLokal = (s: string) => new Date(`${s}:00+07:00`).toISOString();

export function FormTahun() {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol onClick={() => setBuka(true)}>Tambah tahun</Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Tambah tahun anggaran" deskripsi="Tagging tahun sebelumnya disalin otomatis ke tahun baru.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const tahun = Number(new FormData(e.currentTarget).get('tahun'));
            try {
              await api('/api/tahun', { body: { tahun } });
              toast(`Tahun ${tahun} dibuat`);
              setBuka(false);
              router.refresh();
            } catch (err) {
              setGalat(pesanGalat(err));
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Bidang label="Tahun" htmlFor="tahun">
            <Masukan id="tahun" name="tahun" type="number" min={2020} max={2100} defaultValue={new Date().getFullYear() + 1} required />
          </Bidang>
          <div className="flex justify-end gap-2">
            <Tombol type="button" onClick={() => setBuka(false)}>
              Batal
            </Tombol>
            <Tombol type="submit" varian="utama">
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function FormTahapan({ awal }: { awal?: { _id: string; nama: string; jadwalMulai: string; jadwalSelesai: string } }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      {awal ? (
        <Tombol kecil varian="hantu" onClick={() => setBuka(true)}>
          Ubah jadwal
        </Tombol>
      ) : (
        <Tombol varian="utama" onClick={() => setBuka(true)}>
          Buat tahapan
        </Tombol>
      )}
      <Modal buka={buka} setBuka={setBuka} judul={awal ? `Ubah ${awal.nama}` : 'Buat tahapan'} deskripsi="Waktu dalam WIB.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const body: Record<string, unknown> = {
              jadwalMulai: dariLokal(String(fd.get('jadwalMulai'))),
              jadwalSelesai: dariLokal(String(fd.get('jadwalSelesai'))),
            };
            if (fd.get('nama')) body.nama = String(fd.get('nama')).trim();
            if (!awal) {
              body.tahun = Number(fd.get('tahun'));
              body.jenis = String(fd.get('jenis'));
            }
            setMemuat(true);
            setGalat('');
            try {
              await api(awal ? `/api/tahapan/${awal._id}` : '/api/tahapan', { method: awal ? 'PATCH' : 'POST', body });
              toast('Tahapan disimpan');
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
          {!awal && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Bidang label="Tahun" htmlFor="tahun">
                <Masukan id="tahun" name="tahun" type="number" min={2020} max={2100} defaultValue={new Date().getFullYear() + 1} required />
              </Bidang>
              <Bidang label="Jenis" htmlFor="jenis" bantuan="Pergeseran boleh lebih dari satu per tahun.">
                <Pilihan id="jenis" name="jenis" defaultValue="APBD">
                  <option value="KUA_PPAS">KUA-PPAS</option>
                  <option value="RAPBD">RAPBD</option>
                  <option value="APBD">APBD</option>
                  <option value="PERGESERAN">Pergeseran</option>
                  <option value="PERUBAHAN">Perubahan</option>
                </Pilihan>
              </Bidang>
            </div>
          )}
          <Bidang label="Nama (opsional)" htmlFor="nama" bantuan="Kosongkan untuk nama baku, misal APBD 2027 atau Pergeseran II 2027.">
            <Masukan id="nama" name="nama" defaultValue={awal?.nama} />
          </Bidang>
          <div className="grid gap-3 sm:grid-cols-2">
            <Bidang label="Jadwal mulai" htmlFor="jadwalMulai">
              <Masukan id="jadwalMulai" name="jadwalMulai" type="datetime-local" defaultValue={keLokal(awal?.jadwalMulai)} required />
            </Bidang>
            <Bidang label="Jadwal selesai" htmlFor="jadwalSelesai">
              <Masukan id="jadwalSelesai" name="jadwalSelesai" type="datetime-local" defaultValue={keLokal(awal?.jadwalSelesai ?? new Date(Date.now() + 30 * 86400_000))} required />
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

export function AksiTahapan({ t }: { t: { _id: string; nama: string; status: string; jadwalMulai: string; jadwalSelesai: string } }) {
  const [bukaUlang, setBukaUlang] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [memuat, setMemuat] = useState('');
  const toast = useToast();
  const router = useRouter();
  const jalan = async (aksi: 'buka' | 'tutup', body?: unknown) => {
    setMemuat(aksi);
    try {
      const r = await api<{ sedangDisalin?: boolean }>(`/api/tahapan/${t._id}/${aksi}`, { method: 'POST', body: body ?? {} });
      toast(aksi === 'tutup' ? `${t.nama} ditutup` : r.sedangDisalin ? `${t.nama} sedang dibuka dan data tahapan sebelumnya disalin…` : `${t.nama} dibuka`);
      setBukaUlang(false);
      setTimeout(() => router.refresh(), r.sedangDisalin ? 1500 : 0);
    } catch (e) {
      toast(pesanGalat(e), 'bahaya');
    } finally {
      setMemuat('');
    }
  };
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <FormTahapan awal={t} />
      {t.status === 'draf' && (
        <Tombol kecil memuat={memuat === 'buka'} onClick={() => confirm(`Buka ${t.nama} sekarang? Data tahapan sebelumnya akan disalin.`) && jalan('buka')}>
          Buka sekarang
        </Tombol>
      )}
      {t.status === 'terbuka' && (
        <Tombol kecil memuat={memuat === 'tutup'} onClick={() => confirm(`Tutup ${t.nama}? Semua perubahan data akan ditolak.`) && jalan('tutup')}>
          Tutup
        </Tombol>
      )}
      {t.status === 'ditutup' && (
        <>
          <Tombol kecil onClick={() => setBukaUlang(true)}>
            Buka ulang
          </Tombol>
          <Modal buka={bukaUlang} setBuka={setBukaUlang} judul={`Buka ulang ${t.nama}`} deskripsi="Alasan wajib dan tercatat di log audit. Pembukaan ulang tidak menyalin data lagi.">
            <Bidang label="Alasan" htmlFor={`alasan-${t._id}`}>
              <AreaTeks id={`alasan-${t._id}`} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
            </Bidang>
            <div className="mt-4 flex justify-end gap-2">
              <Tombol onClick={() => setBukaUlang(false)}>Batal</Tombol>
              <Tombol varian="utama" disabled={alasan.trim().length < 5} memuat={memuat === 'buka'} onClick={() => jalan('buka', { alasan })}>
                Buka ulang
              </Tombol>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
