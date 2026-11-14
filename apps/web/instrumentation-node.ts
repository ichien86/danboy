import { tambahJob } from '@danboy/core/services';

const g = globalThis as unknown as { __danboyCron?: NodeJS.Timeout };

if (!process.env.REDIS_URL && !g.__danboyCron) {
  g.__danboyCron = setInterval(() => {
    tambahJob('jadwalTahapan', {}).catch((e) => console.error('[cron] jadwalTahapan', e));
  }, 60_000);
}
