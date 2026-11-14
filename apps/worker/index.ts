/**
 * Worker BullMQ: impor (proses/terapkan), salin tahapan, dan cron jadwalTahapan tiap menit.
 * Konkurensi 1: satu pekerjaan berat per waktu.
 */
import { Queue, Worker } from 'bullmq';
import { jalankanJob, type NamaJob } from '@danboy/core/jobs';
import { koneksiRedis, NAMA_ANTREAN } from '@danboy/core/services';
import { putus, sambung } from '@danboy/db';

if (!process.env.REDIS_URL) {
  console.error('REDIS_URL wajib diisi untuk worker. Tanpa Redis, job dijalankan in-process oleh web.');
  process.exit(1);
}

const log = (tingkat: 'info' | 'error', pesan: string, data: Record<string, unknown> = {}) =>
  console[tingkat === 'error' ? 'error' : 'log'](JSON.stringify({ waktu: new Date().toISOString(), tingkat, layanan: 'worker', pesan, ...data }));

await sambung();
const koneksi = koneksiRedis();
const antrean = new Queue(NAMA_ANTREAN, { connection: koneksi });
await antrean.upsertJobScheduler('jadwalTahapan', { pattern: '* * * * *', tz: 'Asia/Jakarta' }, { name: 'jadwalTahapan', data: {} });

const worker = new Worker(
  NAMA_ANTREAN,
  async (job) => {
    const mulai = Date.now();
    const hasil = await jalankanJob(job.name as NamaJob, job.data);
    if (job.name !== 'jadwalTahapan') log('info', 'job selesai', { job: job.name, id: job.id, ms: Date.now() - mulai });
    return hasil ?? null;
  },
  { connection: koneksi, concurrency: 1 },
);
worker.on('failed', (job, e) => log('error', 'job gagal', { job: job?.name, id: job?.id, galat: e.message }));
log('info', 'worker siap', { antrean: NAMA_ANTREAN });

const berhenti = async () => {
  log('info', 'worker berhenti');
  await worker.close();
  await antrean.close();
  await putus();
  process.exit(0);
};
process.on('SIGINT', berhenti);
process.on('SIGTERM', berhenti);
