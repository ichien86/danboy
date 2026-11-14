import type { Queue } from 'bullmq';

export const NAMA_ANTREAN = 'danboy';

export type NamaJob =
  | 'imporApbd:proses'
  | 'imporApbd:terapkan'
  | 'imporMaster:proses'
  | 'imporMaster:terapkan'
  | 'verifikasi:proses'
  | 'salinTahapan'
  | 'jadwalTahapan';

export interface DataJob {
  batchId?: string;
  tahapanId?: string;
  userId?: string;
  ip?: string;
}

const g = globalThis as unknown as { __danboyQueue?: Queue; __danboyRantai?: Promise<void> };

export function koneksiRedis() {
  const url = new URL(process.env.REDIS_URL!);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null,
  };
}

async function antrean(): Promise<Queue> {
  if (!g.__danboyQueue) {
    const { Queue } = await import('bullmq');
    g.__danboyQueue = new Queue(NAMA_ANTREAN, { connection: koneksiRedis() });
  }
  return g.__danboyQueue;
}

/**
 * Masukkan pekerjaan berat ke antrean BullMQ (dikerjakan worker).
 * Tanpa REDIS_URL (pengembangan lokal) pekerjaan dijalankan in-process di latar belakang.
 */
export async function tambahJob(nama: NamaJob, data: DataJob): Promise<void> {
  if (process.env.REDIS_URL) {
    const q = await antrean();
    await q.add(nama, data, { removeOnComplete: 200, removeOnFail: 500, attempts: 1 });
    return;
  }
  // Rantai promise = konkurensi 1, sama seperti worker produksi.
  g.__danboyRantai = (g.__danboyRantai ?? Promise.resolve()).then(async () => {
    try {
      const { jalankanJob } = await import('../jobs');
      await jalankanJob(nama, data);
    } catch (e) {
      console.error(`[job ${nama}] gagal`, e);
    }
  });
}

/** Untuk uji: tunggu semua job in-process selesai. */
export const tungguJobLokal = () => g.__danboyRantai ?? Promise.resolve();
