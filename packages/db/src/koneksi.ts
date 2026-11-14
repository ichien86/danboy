import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

const g = globalThis as unknown as { __danboyMongo?: Promise<typeof mongoose> };

/** Nama database dari URI (bagian path), atau undefined bila tidak ada. */
export function namaDatabase(uri: string): string | undefined {
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Status server MongoDB. Aplikasi butuh replica set (MongoDB Atlas sudah replica set; MongoDB lokal perlu
 * dijalankan dengan --replSet) karena impor, salin tahapan, dan keputusan Admin memakai transaksi.
 */
export async function infoServer() {
  await sambung();
  const h = (await mongoose.connection.db!.admin().command({ hello: 1 })) as { setName?: string; msg?: string };
  const b = (await mongoose.connection.db!.admin().command({ buildInfo: 1 })) as { version: string };
  return { versi: b.version, replicaSet: h.setName ?? (h.msg === 'isdbgrid' ? 'sharded' : null), database: mongoose.connection.db!.databaseName };
}

/** Satu koneksi per proses; aman dipanggil berulang (hot reload Next.js). */
export function sambung(uri = process.env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (!uri) throw new Error('MONGODB_URI belum diatur');
  if (!g.__danboyMongo) {
    g.__danboyMongo = mongoose
      .connect(uri, {
        // URI tanpa nama database (umum pada MongoDB Atlas) memakai database 'danboy'
        dbName: process.env.MONGODB_DB || namaDatabase(uri) || 'danboy',
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10_000,
        autoIndex: process.env.NODE_ENV !== 'production',
      })
      .catch((e) => {
        g.__danboyMongo = undefined;
        throw e;
      });
  }
  return g.__danboyMongo;
}

export async function putus() {
  g.__danboyMongo = undefined;
  await mongoose.disconnect();
}

/** Jalankan fn dalam transaksi multi-dokumen (butuh replica set). */
export async function dalamTransaksi<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  await sambung();
  const session = await mongoose.startSession();
  try {
    let hasil: T | undefined;
    await session.withTransaction(async () => {
      hasil = await fn(session);
    });
    return hasil as T;
  } finally {
    await session.endSession();
  }
}

export { mongoose };
