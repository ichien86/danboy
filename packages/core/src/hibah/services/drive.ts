import { HibahDrive, sambung, type HibahDriveDoc } from '@danboy/db';
import { pastikanBolehHibah, type SessionUser } from '../../akses';
import { penyimpanan } from '../drive';
import { ringkasanBerkas } from './berkas';
import { ser } from './umum';

/** Status koneksi Drive, akun, kuota, dan antrean berkas (FR-53). */
export async function statusDrive(user: SessionUser, segarkanKuota = false) {
  pastikanBolehHibah(user, 'hibah_kelola_drive');
  await sambung();
  let d = await HibahDrive.findOne({ kunci: 'utama' }, { tokenTerenkripsi: 0, folder: 0 }).lean<HibahDriveDoc>();
  let galatKuota = '';
  if (d?.status === 'terhubung' && (segarkanKuota || !d.kuota?.diperbarui || Date.now() - +new Date(d.kuota.diperbarui) > 3_600_000)) {
    try {
      await penyimpanan().kuota();
      d = await HibahDrive.findOne({ kunci: 'utama' }, { tokenTerenkripsi: 0, folder: 0 }).lean<HibahDriveDoc>();
    } catch (e) {
      galatKuota = (e as Error).message.slice(0, 200);
    }
  }
  const sisa = d?.kuota?.total && d.kuota.dipakai !== null ? (d.kuota.total - d.kuota.dipakai) / d.kuota.total : null;
  return ser({
    terhubung: d?.status === 'terhubung',
    status: d?.status ?? 'belum',
    email: d?.email ?? '',
    kuota: d?.kuota ?? null,
    sisaPersen: sisa === null ? null : Math.round(sisa * 1000) / 10,
    kuotaMenipis: sisa !== null && sisa < 0.1,
    galatKuota,
    berkas: await ringkasanBerkas(),
    konfigurasiLengkap: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
    kunciLengkap: !!(process.env.KUNCI_ENKRIPSI && process.env.KUNCI_SIDIK),
  });
}

/** Putuskan koneksi: token dihapus; berkas yang sudah di Drive tetap ada, unggahan baru menunggu di GridFS. */
export async function putuskanDrive(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_kelola_drive');
  await sambung();
  await HibahDrive.findOneAndUpdate({ kunci: 'utama' }, { $set: { status: 'putus', tokenTerenkripsi: '' } });
  return { ok: true };
}
