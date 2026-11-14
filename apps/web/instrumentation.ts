/** Tanpa REDIS_URL (pengembangan lokal), cron jadwalTahapan dijalankan in-process setiap menit. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
