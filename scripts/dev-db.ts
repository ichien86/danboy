/**
 * MongoDB replica set lokal untuk pengembangan (tanpa Docker): mongodb-memory-server dengan
 * penyimpanan persisten di .data/mongo, port 27017, replSet rs0. Transaksi multi-dokumen tersedia.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const dbPath = resolve('.data/mongo');
mkdirSync(dbPath, { recursive: true });

const rs = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: Number(process.env.DEV_DB_PORT ?? 27017), dbPath }],
});
console.log(`MongoDB replica set siap: ${rs.getUri('danboy')}`);
console.log('Data disimpan di .data/mongo. Tekan Ctrl+C untuk berhenti.');

const berhenti = async () => {
  await rs.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', berhenti);
process.on('SIGTERM', berhenti);
setInterval(() => {}, 1 << 30);
