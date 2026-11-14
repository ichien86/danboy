/**
 * Salin seluruh data DANBOY dari satu MongoDB ke MongoDB lain (mis. dari MongoDB pengembangan ke MongoDB Atlas
 * atau ke server), termasuk file unggahan (GridFS) dan log audit, lalu pasang indeks di tujuan.
 *
 *   pnpm data:pindah --ke "mongodb+srv://user:sandi@cluster0.xxxx.mongodb.net/danboy"
 *   pnpm data:pindah --ke "<uri tujuan>" --dari "<uri asal>"     (asal bawaan: MONGODB_URI di .env)
 *   pnpm data:pindah --ke "<uri tujuan>" --timpa                 (kosongkan koleksi tujuan yang sudah berisi)
 *
 * Tujuan harus replica set (MongoDB Atlas sudah). Asal tidak diubah sama sekali.
 */
import './env';
import { mongoose, namaDatabase, semuaModel } from '@danboy/db';

const arg = (nama: string) => {
  const i = process.argv.indexOf(`--${nama}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dari = arg('dari') ?? process.env.MONGODB_URI;
const ke = arg('ke');
const timpa = process.argv.includes('--timpa');
if (!dari || !ke) {
  console.error('Pakai: pnpm data:pindah --ke "<uri MongoDB tujuan>" [--dari "<uri asal>"] [--timpa]');
  process.exit(1);
}
const sembunyi = (u: string) => u.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@');
if (dari === ke) {
  console.error('URI asal dan tujuan sama.');
  process.exit(1);
}

const { MongoClient } = mongoose.mongo;
const asal = new MongoClient(dari, { serverSelectionTimeoutMS: 15_000 });
const tujuan = new MongoClient(ke, { serverSelectionTimeoutMS: 15_000 });
const dbAsal = namaDatabase(dari) ?? 'danboy';
const dbTujuan = namaDatabase(ke) ?? 'danboy';

try {
  await asal.connect();
  await tujuan.connect();
  console.log(`Asal   : ${sembunyi(dari)} (database ${dbAsal})`);
  console.log(`Tujuan : ${sembunyi(ke)} (database ${dbTujuan})`);

  const hello = (await tujuan.db('admin').command({ hello: 1 })) as { setName?: string; msg?: string };
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('MongoDB tujuan bukan replica set; DANBOY butuh transaksi. Pakai MongoDB Atlas atau jalankan mongod dengan --replSet.');
  }

  const A = asal.db(dbAsal);
  const T = tujuan.db(dbTujuan);
  const koleksi = (await A.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
  if (!koleksi.length) throw new Error(`Database asal "${dbAsal}" kosong.`);

  const berisi: string[] = [];
  for (const n of koleksi) if ((await T.collection(n).estimatedDocumentCount()) > 0) berisi.push(n);
  if (berisi.length && !timpa) {
    throw new Error(`Koleksi tujuan sudah berisi data: ${berisi.join(', ')}. Tambahkan --timpa untuk mengosongkannya lebih dulu.`);
  }

  let total = 0;
  for (const n of koleksi) {
    if (berisi.includes(n)) await T.collection(n).deleteMany({});
    const jumlahAsal = await A.collection(n).countDocuments();
    let blok: Record<string, unknown>[] = [];
    let disalin = 0;
    for await (const d of A.collection(n).find({}, { batchSize: 1000 })) {
      blok.push(d);
      if (blok.length === 1000) {
        await T.collection(n).insertMany(blok, { ordered: false });
        disalin += blok.length;
        blok = [];
      }
    }
    if (blok.length) {
      await T.collection(n).insertMany(blok, { ordered: false });
      disalin += blok.length;
    }
    const jumlahTujuan = await T.collection(n).countDocuments();
    total += disalin;
    const cocok = jumlahTujuan === jumlahAsal;
    console.log(`  ${cocok ? '✓' : '✗'} ${n.padEnd(22)} ${String(jumlahAsal).padStart(7)} → ${jumlahTujuan}`);
    if (!cocok) throw new Error(`Jumlah dokumen ${n} tidak cocok`);
  }

  // indeks (unik, parsial, teks) dipasang dari definisi skema, sama seperti `pnpm db:indexes`
  const m = await mongoose.connect(ke, { dbName: dbTujuan });
  for (const model of semuaModel) await model.syncIndexes();
  await m.disconnect();

  console.log(`\nSelesai: ${total.toLocaleString('id-ID')} dokumen dari ${koleksi.length} koleksi disalin, indeks terpasang.`);
  console.log('Arahkan aplikasi ke database baru dengan mengubah MONGODB_URI di .env, lalu jalankan ulang aplikasi.');
} catch (e) {
  console.error(`\nGagal: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await asal.close();
  await tujuan.close();
}
