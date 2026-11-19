'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { TombolAksi } from '@/components/hibah';
import { tanggal } from '@/components/domain';
import { AreaTeks, Bidang, Masukan, Peringatan, Pilihan, Tabel, TD, TH, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const iso = (d?: string | null) => (d ? new Date(new Date(d).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : '');
/** Tanggal dari input (YYYY-MM-DD) sebagai tengah malam WIB. */
const wib = (s: string) => new Date(`${s}T00:00:00+07:00`).toISOString();

export function FormTahunBaru() {
  const [buka, setBuka] = useState(false);
  const [tahun, setTahun] = useState(String(new Date().getFullYear() + 1));
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol varian="utama" onClick={() => setBuka(true)}>
        Tambah tahun anggaran
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Tambah tahun anggaran">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/hibah/tahun', { body: { tahun: Number(tahun) } });
              toast('Tahun anggaran ditambahkan');
              setBuka(false);
              router.push(`?tahun=${tahun}`);
              router.refresh();
            } catch (err) {
              setGalat(pesanGalat(err));
            }
          }}
        >
          {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
          <Bidang label="Tahun" htmlFor="tahun">
            <Masukan id="tahun" type="number" min={2020} max={2100} value={tahun} onChange={(e) => setTahun(e.target.value)} required />
          </Bidang>
          <div className="flex justify-end">
            <Tombol type="submit" varian="utama">
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function TombolAktifkan({ tahun }: { tahun: number }) {
  return <TombolAksi url={`/api/hibah/tahun/${tahun}`} method="PATCH" body={{ aktif: true }} label={`Jadikan TA ${tahun} aktif`} konfirmasi={`Jadikan TA ${tahun} tahun aktif? Usulan baru akan masuk ke tahun ini.`} berhasil="Tahun aktif diganti" />;
}

export function FormJadwal({ tahun, jadwal }: { tahun: number; jadwal: Data[] }) {
  const [isi, setIsi] = useState(() => jadwal.map((j) => ({ tahapan: j.tahapan, label: j.label, mulai: iso(j.mulai), selesai: iso(j.selesai), berjalan: j.berjalan })));
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMemuat(true);
        setGalat('');
        try {
          const terisi = isi.filter((j) => j.mulai && j.selesai);
          await api(`/api/hibah/jadwal/${tahun}`, { method: 'PUT', body: { jadwal: terisi.map((j) => ({ tahapan: j.tahapan, mulai: wib(j.mulai), selesai: wib(j.selesai) })) } });
          toast('Jadwal disimpan');
          router.refresh();
        } catch (err) {
          setGalat(pesanGalat(err));
        } finally {
          setMemuat(false);
        }
      }}
    >
      {galat && <Peringatan nada="bahaya">{galat}</Peringatan>}
      <Tabel>
        <thead>
          <tr>
            <TH>Tahapan</TH>
            <TH>Mulai</TH>
            <TH>Selesai</TH>
          </tr>
        </thead>
        <tbody>
          {isi.map((j, i) => (
            <tr key={j.tahapan}>
              <TD>
                <p className="font-medium">{j.label}</p>
                {j.berjalan && <p className="text-xs text-aman">sedang berjalan</p>}
              </TD>
              {(['mulai', 'selesai'] as const).map((k) => (
                <TD key={k}>
                  <Masukan
                    type="date"
                    value={j[k]}
                    aria-label={`${j.label} ${k}`}
                    onChange={(e) => setIsi((s) => s.map((x, n) => (n === i ? { ...x, [k]: e.target.value } : x)))}
                  />
                </TD>
              ))}
            </tr>
          ))}
        </tbody>
      </Tabel>
      <p className="text-xs text-redup">Tanggal selesai berlaku sampai pukul 23.59 WIB. Di luar jadwal, aksi tahapan itu terkunci kecuali untuk PD yang diberi perpanjangan.</p>
      <div className="flex justify-end">
        <Tombol type="submit" varian="utama" memuat={memuat}>
          Simpan jadwal
        </Tombol>
      </div>
    </form>
  );
}

export function FormPerpanjangan({ tahun, jadwal, skpd }: { tahun: number; jadwal: Data[]; skpd: { _id: string; nama: string }[] }) {
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const toast = useToast();
  const router = useRouter();
  const semua = jadwal.flatMap((j) => j.perpanjangan.map((p: Data) => ({ ...p, tahapan: j.tahapan, label: j.label })));
  return (
    <div className="space-y-3">
      {semua.length ? (
        <Tabel>
          <thead>
            <tr>
              <TH>Perangkat Daerah</TH>
              <TH>Tahapan</TH>
              <TH>Sampai</TH>
              <TH>Alasan</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {semua.map((p) => (
              <tr key={`${p.tahapan}-${p.skpdId}`}>
                <TD>{p.namaPd}</TD>
                <TD>{p.label}</TD>
                <TD className="whitespace-nowrap">{tanggal(p.selesaiBaru)}</TD>
                <TD className="text-redup">{p.alasan}</TD>
                <TD>
                  <TombolAksi url={`/api/hibah/jadwal/${tahun}/perpanjangan?tahapan=${p.tahapan}&skpdId=${p.skpdId}`} method="DELETE" label="Cabut" varian="hantu" konfirmasi="Cabut perpanjangan ini?" berhasil="Perpanjangan dicabut" />
                </TD>
              </tr>
            ))}
          </tbody>
        </Tabel>
      ) : (
        <p className="text-sm text-redup">Belum ada perpanjangan.</p>
      )}
      <Tombol kecil onClick={() => setBuka(true)}>
        Beri perpanjangan
      </Tombol>
      <Modal buka={buka} setBuka={setBuka} judul="Beri perpanjangan">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setGalat({});
            setUmum('');
            try {
              await api(`/api/hibah/jadwal/${tahun}/perpanjangan`, {
                body: { tahapan: fd.get('tahapan'), skpdId: fd.get('skpdId'), selesaiBaru: wib(String(fd.get('selesaiBaru'))), alasan: fd.get('alasan') },
              });
              toast('Perpanjangan diberikan');
              setBuka(false);
              router.refresh();
            } catch (err) {
              if (err instanceof GalatApi && err.detail) setGalat(err.detail);
              setUmum(pesanGalat(err));
            }
          }}
        >
          {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
          <Bidang label="Tahapan" htmlFor="p-tahapan">
            <Pilihan id="p-tahapan" name="tahapan" required>
              {jadwal.filter((j) => j.selesai).map((j) => (
                <option key={j.tahapan} value={j.tahapan}>
                  {j.label} (selesai {tanggal(j.selesai)})
                </option>
              ))}
            </Pilihan>
          </Bidang>
          <Bidang label="Perangkat Daerah" htmlFor="p-skpd">
            <Pilihan id="p-skpd" name="skpdId" required>
              <option value="">Pilih…</option>
              {skpd.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nama}
                </option>
              ))}
            </Pilihan>
          </Bidang>
          <Bidang label="Tanggal akhir baru" htmlFor="p-sampai" galat={galat.selesaiBaru}>
            <Masukan id="p-sampai" name="selesaiBaru" type="date" required />
          </Bidang>
          <Bidang label="Alasan" htmlFor="p-alasan">
            <AreaTeks id="p-alasan" name="alasan" rows={2} required />
          </Bidang>
          <div className="flex justify-end">
            <Tombol type="submit" varian="utama">
              Simpan
            </Tombol>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function FormDasarHukum({ tahun, awal }: { tahun: number; awal: string[] }) {
  const [teks, setTeks] = useState(awal.join('\n'));
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/hibah/tahun/${tahun}`, { method: 'PATCH', body: { dasarHukum: teks.split('\n').map((s) => s.trim()).filter(Boolean) } });
          toast('Dasar hukum disimpan');
          router.refresh();
        } catch (err) {
          toast(pesanGalat(err), 'bahaya');
        }
      }}
    >
      <AreaTeks value={teks} onChange={(e) => setTeks(e.target.value)} rows={6} aria-label="Dasar hukum, satu per baris" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-redup">Satu peraturan per baris; dicetak berurutan di Berita Acara.</p>
        <Tombol type="submit" kecil>
          Simpan
        </Tombol>
      </div>
    </form>
  );
}
