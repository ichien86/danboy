import { NextResponse } from 'next/server';
import { infoServer } from '@danboy/db';

export const dynamic = 'force-dynamic';

/** Pemeriksaan kesehatan: MongoDB, Redis, dan antrean. */
export async function GET() {
  const hasil: Record<string, string> = {};
  try {
    const info = await infoServer();
    hasil.mongodb = 'ok';
    hasil.mongodbVersi = info.versi;
    hasil.database = info.database;
    // transaksi butuh replica set; tanpa itu impor dan keputusan Admin akan gagal
    hasil.replicaSet = info.replicaSet ?? 'gagal: MongoDB bukan replica set (jalankan mongod dengan --replSet)';
  } catch {
    hasil.mongodb = 'gagal';
  }
  if (process.env.REDIS_URL) {
    try {
      const { Queue } = await import('bullmq');
      const { koneksiRedis, NAMA_ANTREAN } = await import('@danboy/core/services');
      const q = new Queue(NAMA_ANTREAN, { connection: koneksiRedis() });
      const c = await q.getJobCounts('waiting', 'active', 'failed');
      hasil.redis = 'ok';
      hasil.antrean = JSON.stringify(c);
      await q.close();
    } catch {
      hasil.redis = 'gagal';
    }
  } else hasil.antrean = 'in-process';
  const sehat = !Object.values(hasil).some((v) => v.startsWith('gagal'));
  return NextResponse.json({ status: sehat ? 'sehat' : 'terganggu', ...hasil }, { status: sehat ? 200 : 503 });
}
