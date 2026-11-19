import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { boleh, LABEL_PERAN as PERAN, LABEL_PERAN_HIBAH, peranHibah, type AksesHibah } from '@danboy/core';
import { daftarPengguna, daftarSkpd } from '@danboy/core/services';
import { tanggal } from '@/components/domain';
import { Kartu, KepalaHalaman, Lencana, Tabel, TD, TH } from '@/components/ui';
import { wajibSesi } from '@/lib/sesi';
import { FormPengguna, ResetSandi } from './form';

export const metadata: Metadata = { title: 'Pengguna' };


interface U {
  _id: string;
  username: string;
  nama: string;
  peran: keyof typeof PERAN | null;
  aksesHibah?: AksesHibah | null;
  skpdId?: { _id: string; nama: string } | null;
  aktif: boolean;
  wajibGantiSandi: boolean;
  terkunciSampai?: string | null;
  loginTerakhir?: string | null;
}

export default async function Pengguna() {
  const user = await wajibSesi();
  if (!boleh(user, 'kelola_pengguna')) redirect('/dasbor');
  const [data, skpd] = await Promise.all([daftarPengguna(user), daftarSkpd(user)]);
  const opsiSkpd = (skpd as unknown as { _id: string; nama: string }[]).map((s) => ({ _id: s._id, nama: s.nama }));
  return (
    <>
      <KepalaHalaman judul="Pengguna" sub="Akun SKPD melihat semua sub unit di bawah SKPD-nya dan otomatis menjadi Operator PD di modul Hibah dan Bansos." aksi={<FormPengguna skpd={opsiSkpd} />} />
      <Kartu padat>
        <Tabel>
          <thead>
            <tr>
              <TH>Pengguna</TH>
              <TH>DANBOY</TH>
              <TH>Hibah dan Bansos</TH>
              <TH>SKPD</TH>
              <TH>Status</TH>
              <TH>Login terakhir</TH>
              <TH />
            </tr>
          </thead>
          <tbody>
            {(data as unknown as U[]).map((u) => (
              <tr key={u._id} className={u.aktif ? '' : 'opacity-60'}>
                <TD>
                  <p className="font-medium">{u.nama}</p>
                  <p className="text-xs text-redup">{u.username}</p>
                </TD>
                <TD>{u.peran ? PERAN[u.peran] : <span className="text-redup">–</span>}</TD>
                <TD>{(() => { const p = peranHibah(u); return p ? LABEL_PERAN_HIBAH[p] : <span className="text-redup">–</span>; })()}</TD>
                <TD className="text-redup">{u.skpdId?.nama ?? '–'}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {!u.aktif && <Lencana>nonaktif</Lencana>}
                    {u.wajibGantiSandi && <Lencana nada="waspada">wajib ganti sandi</Lencana>}
                    {u.terkunciSampai && new Date(u.terkunciSampai) > new Date() && <Lencana nada="bahaya">terkunci</Lencana>}
                    {u.aktif && !u.wajibGantiSandi && <Lencana nada="aman">aktif</Lencana>}
                  </div>
                </TD>
                <TD className="whitespace-nowrap text-redup">{tanggal(u.loginTerakhir, true)}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <FormPengguna skpd={opsiSkpd} awal={{ _id: u._id, username: u.username, nama: u.nama, peran: u.peran, skpdId: u.skpdId?._id ?? '', aksesHibah: u.aksesHibah ?? null, aktif: u.aktif }} diriSendiri={u._id === user.id} />
                    <ResetSandi id={u._id} nama={u.nama} />
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </Tabel>
      </Kartu>
    </>
  );
}
