import { NextResponse } from 'next/server';
import { mongoose, sambung } from '@danboy/db';

export const dynamic = 'force-dynamic';

/** Pemeriksaan kesehatan: MongoDB, Redis, dan antrean. */
export async function GET() {
  const hasil: Record<string, string> = {};
  try {
    await sambung();
    await mongoose.connection.db!.admin().ping();
    hasil.mongodb = 'ok';
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
  const sehat = !Object.values(hasil).includes('gagal');
  return NextResponse.json({ status: sehat ? 'sehat' : 'terganggu', ...hasil }, { status: sehat ? 200 : 503 });
}
