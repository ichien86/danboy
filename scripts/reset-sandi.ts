/**
 * Reset sandi satu akun dari baris perintah, misalnya bila sandi satu-satunya Super Admin terlupa.
 * Membuat sandi sementara (dicetak sekali), membuka kunci akun, dan mewajibkan ganti sandi saat masuk.
 *   Lokal  : pnpm akun:reset superadmin
 *   Server : docker compose -f deploy/docker-compose.yml run --rm worker node_modules/.bin/tsx scripts/reset-sandi.ts superadmin
 */
import './env';
import { User, catatAudit, putus, sambung } from '@danboy/db';
import { hashSandi, sandiAwal } from '@danboy/core/services';

const username = (process.argv[2] ?? '').toLowerCase().trim();
if (!username) {
  console.error('Pakai: pnpm akun:reset <username>');
  process.exit(1);
}
await sambung();
const u = await User.findOne({ username }).lean();
if (!u) {
  const ada = await User.find().select('username peran').lean();
  console.error(`Akun "${username}" tidak ada. Akun yang tersedia: ${ada.map((x) => `${x.username} (${x.peran})`).join(', ') || '(belum ada)'}`);
  await putus();
  process.exit(1);
}
const { sandi } = sandiAwal();
await User.updateOne(
  { _id: u._id },
  { $set: { passwordHash: await hashSandi(sandi), wajibGantiSandi: true, gagalLogin: 0, terkunciSampai: null, aktif: true } },
);
await catatAudit({ aksi: 'reset_sandi_cli', koleksi: 'user', dokumenId: u._id, sesudah: { username } });
console.log(`Sandi akun ${username} direset.`);
console.log(`  sandi sementara : ${sandi}   (wajib diganti saat masuk)`);
await putus();
