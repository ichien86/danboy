'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, useToast } from '@/components/klien';
import { Bidang, Masukan, Peringatan, Pilihan, Tombol } from '@/components/ui';
import { api, GalatApi, pesanGalat } from '@/lib/klien';

function SandiSementara({ sandi, tetap, onTutup }: { sandi: string; tetap?: boolean; onTutup: () => void }) {
  return (
    <div className="space-y-3">
      <Peringatan nada="aman" judul={tetap ? 'Sandi awal (ditetapkan)' : 'Sandi sementara'}>
        {tetap
          ? 'Akun memakai sandi awal yang ditetapkan di pengaturan server. Pengguna wajib menggantinya saat masuk pertama; segera minta pengguna masuk dan mengganti sandi.'
          : 'Berikan sandi ini kepada pengguna secara langsung. Sandi hanya ditampilkan sekali dan wajib diganti saat masuk pertama.'}
      </Peringatan>
      <p className="select-all rounded-md border border-garis bg-latar px-3 py-2 text-center font-mono text-lg tracking-wider">{sandi}</p>
      <div className="flex justify-end gap-2">
        <Tombol onClick={() => navigator.clipboard?.writeText(sandi)}>Salin</Tombol>
        <Tombol varian="utama" onClick={onTutup}>
          Selesai
        </Tombol>
      </div>
    </div>
  );
}

export function FormPengguna({
  skpd,
  awal,
  diriSendiri,
}: {
  skpd: { _id: string; nama: string }[];
  awal?: { _id: string; username: string; nama: string; peran: string | null; skpdId: string; aksesHibah: string | null; aktif: boolean };
  diriSendiri?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  // '' = tanpa akses DANBOY / tanpa akses modul Hibah dan Bansos
  const [peran, setPeran] = useState(awal ? (awal.peran ?? '') : 'skpd');
  const [aksesHibah, setAksesHibah] = useState(awal?.aksesHibah ?? '');
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [sandi, setSandi] = useState('');
  const [tetap, setTetap] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const tutup = () => {
    setBuka(false);
    setSandi('');
    router.refresh();
  };
  return (
    <>
      {awal ? (
        <Tombol kecil varian="hantu" onClick={() => setBuka(true)}>
          Ubah
        </Tombol>
      ) : (
        <Tombol varian="utama" onClick={() => setBuka(true)}>
          Tambah pengguna
        </Tombol>
      )}
      <Modal buka={buka} setBuka={(b) => (b ? setBuka(true) : tutup())} judul={awal ? `Ubah ${awal.nama}` : 'Tambah pengguna'}>
        {sandi ? (
          <SandiSementara sandi={sandi} tetap={tetap} onTutup={tutup} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const body: Record<string, unknown> = {
                nama: String(fd.get('nama')).trim(),
                peran: peran || null,
                skpdId: peran === 'skpd' ? String(fd.get('skpdId') || '') || null : null,
                aksesHibah: peran === 'skpd' ? null : aksesHibah || null,
              };
              if (!awal) body.username = String(fd.get('username')).trim();
              else body.aktif = fd.get('aktif') === 'on';
              setMemuat(true);
              setGalat({});
              setUmum('');
              try {
                const r = await api<{ sandiSementara?: string; sandiTetap?: boolean }>(awal ? `/api/pengguna/${awal._id}` : '/api/pengguna', { method: awal ? 'PATCH' : 'POST', body });
                toast('Pengguna disimpan');
                if (r.sandiSementara) {
                  setTetap(!!r.sandiTetap);
                  setSandi(r.sandiSementara);
                }
                else tutup();
              } catch (err) {
                if (err instanceof GalatApi && err.detail) setGalat(err.detail);
                setUmum(pesanGalat(err));
              } finally {
                setMemuat(false);
              }
            }}
          >
            {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
            <Bidang label="Username" htmlFor="username" galat={galat.username}>
              <Masukan id="username" name="username" defaultValue={awal?.username} disabled={!!awal} required={!awal} autoComplete="off" />
            </Bidang>
            <Bidang label="Nama" htmlFor="nama" galat={galat.nama}>
              <Masukan id="nama" name="nama" defaultValue={awal?.nama} required />
            </Bidang>
            <Bidang label="Akses DANBOY" htmlFor="peran" galat={galat.peran}>
              <Pilihan id="peran" value={peran} onChange={(e) => setPeran(e.target.value)} disabled={diriSendiri}>
                <option value="">Tidak ada</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin Keuangan</option>
                <option value="skpd">SKPD</option>
              </Pilihan>
            </Bidang>
            {peran === 'skpd' && (
              <Bidang label="SKPD" htmlFor="skpdId" galat={galat.skpdId}>
                <Pilihan id="skpdId" name="skpdId" defaultValue={awal?.skpdId} required>
                  <option value="">Pilih SKPD…</option>
                  {skpd.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.nama}
                    </option>
                  ))}
                </Pilihan>
              </Bidang>
            )}
            <Bidang
              label="Akses Hibah dan Bansos"
              htmlFor="aksesHibah"
              galat={galat.aksesHibah}
              bantuan={peran === 'skpd' ? 'Akun SKPD otomatis menjadi Operator PD untuk SKPD-nya.' : undefined}
            >
              <Pilihan id="aksesHibah" value={peran === 'skpd' ? 'operator_pd' : aksesHibah} onChange={(e) => setAksesHibah(e.target.value)} disabled={peran === 'skpd'}>
                {peran === 'skpd' ? (
                  <option value="operator_pd">Operator PD</option>
                ) : (
                  <>
                    <option value="">Tidak ada</option>
                    <option value="admin_perencana">Admin Perencana</option>
                    <option value="verifikator">Verifikator TAPD</option>
                    <option value="anggota">Anggota TAPD</option>
                  </>
                )}
              </Pilihan>
            </Bidang>
            {awal && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="aktif" defaultChecked={awal.aktif} disabled={diriSendiri} /> Aktif
              </label>
            )}
            {!awal && <p className="text-xs text-redup">Sandi sementara dibuat otomatis dan ditampilkan setelah disimpan.</p>}
            <div className="flex justify-end gap-2">
              <Tombol type="button" onClick={() => setBuka(false)}>
                Batal
              </Tombol>
              <Tombol type="submit" varian="utama" memuat={memuat}>
                Simpan
              </Tombol>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function ResetSandi({ id, nama }: { id: string; nama: string }) {
  const [sandi, setSandi] = useState('');
  const [tetap, setTetap] = useState(false);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Tombol
        kecil
        varian="hantu"
        onClick={async () => {
          if (!confirm(`Reset kata sandi ${nama}? Pengguna wajib mengganti sandi saat masuk.`)) return;
          try {
            const r = await api<{ sandiSementara: string; sandiTetap?: boolean }>(`/api/pengguna/${id}/reset-sandi`, { method: 'POST' });
            setTetap(!!r.sandiTetap);
            setSandi(r.sandiSementara);
          } catch (e) {
            toast(pesanGalat(e), 'bahaya');
          }
        }}
      >
        Reset sandi
      </Tombol>
      <Modal buka={!!sandi} setBuka={(b) => !b && (setSandi(''), router.refresh())} judul={`Sandi baru ${nama}`}>
        <SandiSementara
          sandi={sandi}
          tetap={tetap}
          onTutup={() => {
            setSandi('');
            router.refresh();
          }}
        />
      </Modal>
    </>
  );
}
