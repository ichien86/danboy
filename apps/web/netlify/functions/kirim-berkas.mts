/**
 * Fungsi terjadwal Netlify: setiap 5 menit memicu pengiriman ulang berkas modul Hibah dan Bansos yang
 * masih menunggu (gagal terkirim ke Google Drive saat diunggah). Butuh CRON_SECRET di pengaturan Netlify.
 */
export default async () => {
  const dasar = process.env.URL;
  const rahasia = process.env.CRON_SECRET;
  if (!dasar || !rahasia) return new Response('URL atau CRON_SECRET belum diatur', { status: 500 });
  const r = await fetch(`${dasar}/api/hibah/cron/kirim-berkas`, { headers: { authorization: `Bearer ${rahasia}` } });
  return new Response(await r.text(), { status: r.status });
};

export const config = { schedule: '*/5 * * * *' };
