import { tambahJob } from '@danboy/core/services';

const g = globalThis as unknown as { __danboyCron?: NodeJS.Timeout };

/**
 * Cron jadwal tahapan in-process (tanpa REDIS_URL). Dimatikan di hosting serverless (Netlify/AWS Lambda) atau bila
 * JADWAL_OTOMATIS=false: fungsi serverless bisa dibekukan di tengah penyalinan data tahapan, jadi buka/salin tahapan
 * dilakukan dari aplikasi lokal atau server yang terus menyala.
 */
const serverless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);
const dimatikan = serverless || process.env.JADWAL_OTOMATIS === 'false';

if (!process.env.REDIS_URL && !dimatikan && !g.__danboyCron) {
  g.__danboyCron = setInterval(() => {
    tambahJob('jadwalTahapan', {}).catch((e) => console.error('[cron] jadwalTahapan', e));
  }, 60_000);
}
