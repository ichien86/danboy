/**
 * Data awal: akun Super Admin (sandi sementara dicetak sekali) dan, dengan --contoh,
 * master + tahapan APBD 2027 terbuka + impor APBD contoh dari tests/fixtures.
 */
import './env';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImporBatch, putus, sambung, semuaModel, SumberDana, Tahapan, User } from '@danboy/db';
import * as svc from '@danboy/core/services';
import type { SessionUser } from '@danboy/core';

await sambung();
await Promise.all(semuaModel.map((m) => m.createIndexes()));

const username = process.env.SEED_USERNAME ?? 'superadmin';
let sa = await User.findOne({ username }).lean();
if (!sa) {
  const sandi = process.env.SEED_PASSWORD ?? svc.sandiSementara();
  const u = await User.create({ username, nama: 'Super Admin', peran: 'super_admin', passwordHash: await svc.hashSandi(sandi), wajibGantiSandi: true });
  sa = u.toObject();
  console.log('Akun Super Admin dibuat.');
  console.log(`  username : ${username}`);
  console.log(`  sandi    : ${sandi}   (wajib diganti saat masuk pertama)`);
} else {
  console.log(`Akun ${username} sudah ada; tidak diubah.`);
}

if (process.argv.includes('--contoh')) {
  const user: SessionUser = { id: String(sa._id), username, nama: 'Super Admin', peran: 'super_admin' };
  const fix = (f: string) => readFileSync(join('tests', 'fixtures', f));
  const tunggu = async (b: { _id: unknown }) => {
    await svc.tungguJobLokal();
    return (await ImporBatch.findById(b._id).lean())!;
  };
  const terapkan = async (b: { _id: unknown; status: string; galat?: string | null }, label: string) => {
    if (b.status !== 'pratinjau') throw new Error(`${label}: ${b.status} ${b.galat ?? ''}`);
    await svc.terapkanImpor(user, String(b._id));
    await svc.tungguJobLokal();
    console.log(`  + ${label}`);
  };
  await svc.denganKonteks({ userId: user.id }, async () => {
    if (!(await SumberDana.exists({}))) {
      await terapkan(await tunggu(await svc.unggahImpor(user, { jenis: 'sumber_dana', namaFile: 'sumber-dana.csv', isi: fix('sumber-dana.csv') })), 'master sumber dana');
      await SumberDana.updateOne({ kode: '1.2.01.08.01' }, { $set: { khusus: true, namaTagging: 'DAU SG Pendidikan' } });
      await SumberDana.updateOne({ kode: '1.2.01.08.02' }, { $set: { khusus: true, namaTagging: 'DAU SG Kesehatan' } });
      await terapkan(
        await tunggu(await svc.unggahImpor(user, { jenis: 'nomenklatur', versi: '900.1-861-2026', namaFile: 'nomenklatur.csv', isi: fix('nomenklatur.csv') })),
        'master nomenklatur',
      );
      await terapkan(await tunggu(await svc.unggahImpor(user, { jenis: 'tagging', tahun: 2027, namaFile: 'tagging.csv', isi: fix('tagging.csv') })), 'daftar tagging 2027');
    }
    if (!(await Tahapan.exists({ tahun: 2027, jenis: 'APBD' }))) {
      const baru = await svc.buatTahapan(user, {
        tahun: 2027,
        jenis: 'APBD',
        jadwalMulai: new Date(Date.now() - 60_000),
        jadwalSelesai: new Date(Date.now() + 60 * 86400_000),
      });
      await svc.salinDanBuka(String(baru._id));
      await terapkan(
        await tunggu(await svc.unggahImpor(user, { jenis: 'apbd', tahapanId: String(baru._id), namaFile: 'apbd-2027-kecil.csv', isi: fix('apbd-2027-kecil.csv') })),
        'rincian APBD 2027 contoh',
      );
      const dau = await SumberDana.findOne({ kode: '1.2.01.01.01' }).lean();
      const dak = await SumberDana.findOne({ kode: '1.2.02.01.01' }).lean();
      await svc.simpanPaguSumberDana(user, String(baru._id), [
        { sumberDanaId: String(dau!._id), nilai: 600_000_000 },
        { sumberDanaId: String(dak!._id), nilai: 2_500_000_000 },
      ]);
      console.log('  + tahapan APBD 2027 terbuka dengan pagu contoh');
    }
  });
}
await putus();
