/** Migrasi indeks: menyelaraskan indeks semua koleksi dengan skema. Dijalankan di CI sebelum rilis. */
import './env';
import { putus, sambung, semuaModel } from '@danboy/db';

await sambung();
for (const m of semuaModel) {
  const dihapus = await m.syncIndexes();
  console.log(`${m.collection.collectionName}: ok${dihapus.length ? ` (dihapus: ${dihapus.join(', ')})` : ''}`);
}
await putus();
