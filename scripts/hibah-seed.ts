/**
 * Data awal master modul Hibah dan Bansos (idempoten) dan, dengan --tahun 2027, tahun anggaran aktif.
 *   pnpm hibah:seed [--tahun 2027]
 *   pnpm hibah:seed --kunci     (cetak KUNCI_ENKRIPSI, KUNCI_SIDIK, CRON_SECRET acak untuk .env; tidak menyentuh database)
 */
import './env';
import { randomBytes } from 'node:crypto';
import { HibahTahun, putus, sambung, semuaModelHibah } from '@danboy/db';

import { DASAR_HUKUM_AWAL, muatDataAwalHibah } from '@danboy/core/services';

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

if (process.argv.includes('--kunci')) {
  console.log('Tambahkan ke .env (dan pengaturan Netlify). Simpan juga salinannya di tempat aman:');
  console.log(`KUNCI_ENKRIPSI=${randomBytes(32).toString('base64')}`);
  console.log(`KUNCI_SIDIK=${randomBytes(32).toString('base64')}`);
  console.log(`CRON_SECRET=${randomBytes(24).toString('base64url')}`);
  process.exit(0);
}

await sambung();
await Promise.all(semuaModelHibah.map((m) => m.createIndexes()));
const hasil = await muatDataAwalHibah();
console.log('Master modul Hibah dan Bansos (butir baru):', hasil);
const tahun = Number(arg('--tahun'));
if (Number.isInteger(tahun) && tahun > 2000) {
  const ada = await HibahTahun.findOne({ tahun }).lean();
  if (ada) console.log(`Tahun ${tahun} sudah ada; tidak diubah.`);
  else {
    const aktif = await HibahTahun.exists({ aktif: true });
    await HibahTahun.create({ tahun, aktif: !aktif, dasarHukum: DASAR_HUKUM_AWAL });
    console.log(`Tahun anggaran ${tahun} dibuat${aktif ? '' : ' dan diaktifkan'}.`);
  }
}
await putus();
