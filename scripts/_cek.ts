import './env';
import { Skpd, SubUnit, Nomenklatur, Tagging, sambung, putus } from '@danboy/db';
(async () => {
  await sambung();
  console.log((await Skpd.find().limit(5).lean()).map((s) => s.kode + ' ' + s.nama));
  console.log((await SubUnit.find().limit(3).lean()).map((s) => s.kode + ' ' + s.nama));
  console.log(await Nomenklatur.countDocuments({ jenis: 'bidang', aktif: true }), (await Nomenklatur.find({ jenis: 'bidang', aktif: true }).limit(4).lean()).map((s) => s.kode + ' ' + s.nama));
  console.log('sub X', await Nomenklatur.countDocuments({ jenis: 'subkegiatan', aktif: true, kode: /^X/ }), 'tag X', await Tagging.countDocuments({ kodeSubkegiatan: /^X/ }), 'tag', await Tagging.countDocuments({}));
  await putus();
})();
