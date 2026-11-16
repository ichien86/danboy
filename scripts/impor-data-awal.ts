/**
 * Memasukkan data awal pagu per subkegiatan beserta sumber dananya langsung ke database, dari file matriks:
 *   sheet "Pagu"        : NAMA SUB UNIT | NAMA KEGIATAN | Kode Subkegiatan | NAMA SUB KEGIATAN | Pagu | <kolom per sumber dana…>
 *   sheet "Sumber Dana" : KODE SUMBER DANA | NAMA SUMBER DANA   (menerjemahkan nama kolom ke kode)
 *
 *   pnpm data:awal --file publik/Kondisi.xlsx                 (pratinjau, tidak menulis apa pun)
 *   pnpm data:awal --file publik/Kondisi.xlsx --terapkan      (tulis ke database, satu transaksi)
 *   opsi: --tahapan <id>  (bawaan: satu-satunya tahapan terbuka)
 *
 * Alokasi ditandai asal "admin": impor APBD SIPD berikutnya tidak menimpanya; komposisi yang berbeda masuk ke
 * Perbedaan SIPD, pagu mengikuti SIPD. Tahapan tujuan harus masih kosong. Sumber dana di sheet yang belum ada di
 * master ikut ditambahkan. Sub unit dicocokkan berdasarkan nama, subkegiatan berdasarkan kode (termasuk pola X.XX).
 */
import './env';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Nomenklatur, SubUnit, SubkegiatanTahapan, SumberDana, Tahapan, catatAudit, dalamTransaksi, oid, putus, sambung } from '@danboy/db';
import { bacaSemuaSheet, normalHeader, type Sel } from '@danboy/excel';
import { adaDiNomenklatur, indukKode, normalisasiKode, parseRupiah } from '@danboy/core';
import { segarkanNotifikasi } from '@danboy/core/services';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const file = arg('file');
const terapkan = process.argv.includes('--terapkan');
if (!file) {
  console.error('Pakai: pnpm data:awal --file <file.xlsx> [--tahapan <id>] [--terapkan]');
  process.exit(1);
}
const teks = (v: Sel | undefined) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
const gagal = (pesan: string, daftar: string[] = []) => {
  console.error(`\nDibatalkan: ${pesan}`);
  daftar.slice(0, 20).forEach((d) => console.error(`  - ${d}`));
  if (daftar.length > 20) console.error(`  … dan ${daftar.length - 20} lainnya`);
  process.exitCode = 1;
};

try {
  const sheets = await bacaSemuaSheet(readFileSync(file));
  const cari = (nama: string) => Object.entries(sheets).find(([n]) => n.trim().toUpperCase() === nama)?.[1];
  const pagu = cari('PAGU');
  const sheetSd = cari('SUMBER DANA');
  if (!pagu || !sheetSd) throw new Error(`File harus punya sheet "Pagu" dan "Sumber Dana" (ada: ${Object.keys(sheets).join(', ')})`);

  await sambung();
  const tahapan = arg('tahapan') ? await Tahapan.findById(arg('tahapan')).lean() : await Tahapan.find({ status: 'terbuka' }).lean().then((t) => (t.length === 1 ? t[0] : null));
  if (!tahapan) throw new Error('Tahapan tujuan tidak jelas: sebutkan --tahapan <id> (harus tepat satu tahapan terbuka bila tidak disebut)');
  if (tahapan.status !== 'terbuka') throw new Error(`Tahapan ${tahapan.nama} tidak terbuka`);
  const sudahAda = await SubkegiatanTahapan.countDocuments({ tahapanId: tahapan._id });
  if (sudahAda) throw new Error(`Tahapan ${tahapan.nama} sudah berisi ${sudahAda} subkegiatan; data awal hanya untuk tahapan kosong`);

  // --- sheet Sumber Dana: nama -> kode
  const kodePerNama = new Map<string, { kode: string; nama: string }>();
  for (const r of sheetSd.slice(1)) {
    const kode = teks(r[0]).replace(/\s/g, '');
    const nama = teks(r[1]);
    if (kode && nama) kodePerNama.set(nama.toUpperCase(), { kode, nama });
  }
  const master = new Map((await SumberDana.find().select('kode').lean()).map((s) => [s.kode, s._id]));
  const sdBaru = [...kodePerNama.values()].filter((s) => !master.has(s.kode));

  // --- header sheet Pagu
  const h = pagu[0].map(normalHeader);
  const iUnit = h.indexOf('NAMA SUB UNIT');
  const iKode = h.findIndex((x) => x.startsWith('KODE SUB'));
  const iNama = h.indexOf('NAMA SUB KEGIATAN');
  const iPagu = h.indexOf('PAGU');
  if ([iUnit, iKode, iNama, iPagu].some((i) => i < 0)) throw new Error('Kolom wajib sheet Pagu: NAMA SUB UNIT, Kode Subkegiatan, NAMA SUB KEGIATAN, Pagu');
  const kolomSd: { i: number; kode: string }[] = [];
  const kolomAsing: string[] = [];
  h.forEach((nama, i) => {
    if (i <= iPagu || !nama) return;
    const s = kodePerNama.get(nama);
    if (s) kolomSd.push({ i, kode: s.kode });
    else kolomAsing.push(teks(pagu[0][i]));
  });
  if (kolomAsing.length) throw new Error(`Kolom sumber dana tidak ada di sheet Sumber Dana: ${kolomAsing.join('; ')}`);

  // --- master untuk pencocokan
  const subUnit = new Map<string, { _id: unknown; skpdId: unknown }[]>();
  for (const s of await SubUnit.find().select('nama skpdId').lean()) {
    const k = s.nama.replace(/\s+/g, ' ').trim().toUpperCase();
    subUnit.set(k, [...(subUnit.get(k) ?? []), s]);
  }
  const nomenklatur = new Set((await Nomenklatur.find({ jenis: 'subkegiatan', aktif: true }).select('kode').lean()).map((n) => n.kode));

  // --- baris data
  const masalah: string[] = [];
  const kunci = new Set<string>();
  const baris: { subUnitId: unknown; skpdId: unknown; kode: string; nama: string; pagu: number; alokasi: { kode: string; nilai: number }[] }[] = [];
  const perSd = new Map<string, number>();
  let total = 0;
  pagu.slice(1).forEach((r, idx) => {
    const no = idx + 2;
    const unit = teks(r[iUnit]);
    if (!unit && !teks(r[iKode])) return;
    const kode = normalisasiKode(teks(r[iKode]));
    const p = parseRupiah(r[iPagu]);
    const su = subUnit.get(unit.toUpperCase());
    if (!su) return void masalah.push(`baris ${no}: sub unit "${unit}" tidak ada di master perangkat daerah`);
    if (su.length > 1) return void masalah.push(`baris ${no}: nama sub unit "${unit}" kembar di master`);
    if (!adaDiNomenklatur(nomenklatur, kode)) return void masalah.push(`baris ${no}: subkegiatan ${kode} tidak ada di master nomenklatur`);
    if (p === null || !Number.isInteger(p) || p < 0) return void masalah.push(`baris ${no}: pagu tidak valid`);
    const alokasi: { kode: string; nilai: number }[] = [];
    for (const k of kolomSd) {
      const v = parseRupiah(r[k.i]) ?? 0;
      if (!Number.isInteger(v) || v < 0) return void masalah.push(`baris ${no}: nilai sumber dana ${k.kode} tidak valid`);
      if (v > 0) alokasi.push({ kode: k.kode, nilai: v });
    }
    const jumlah = alokasi.reduce((a, b) => a + b.nilai, 0);
    if (jumlah !== p) return void masalah.push(`baris ${no}: pagu ${rp(p)} tidak sama dengan jumlah sumber dana ${rp(jumlah)}`);
    const kk = `${su[0]._id}|${kode}`;
    if (kunci.has(kk)) return void masalah.push(`baris ${no}: ganda (${unit}, ${kode})`);
    kunci.add(kk);
    total += p;
    for (const a of alokasi) perSd.set(a.kode, (perSd.get(a.kode) ?? 0) + a.nilai);
    baris.push({ subUnitId: su[0]._id, skpdId: su[0].skpdId, kode, nama: teks(r[iNama]), pagu: p, alokasi });
  });

  console.log(`File      : ${basename(file)}`);
  console.log(`Tahapan   : ${tahapan.nama} (${tahapan.tahun})`);
  console.log(`Subkegiatan: ${baris.length} baris, total pagu ${rp(total)}`);
  console.log(`Sumber dana dipakai: ${perSd.size}; ditambahkan ke master: ${sdBaru.length}${sdBaru.length ? ` (${sdBaru.map((s) => s.kode).join(', ')})` : ''}`);
  if (masalah.length) {
    gagal(`${masalah.length} baris bermasalah; tidak ada yang ditulis`, masalah);
  } else if (!terapkan) {
    console.log('\nPratinjau saja, belum ada yang ditulis. Tambahkan --terapkan untuk memasukkan ke database.');
  } else {
    await dalamTransaksi(async (session) => {
      if (sdBaru.length) {
        const dibuat = await SumberDana.insertMany(
          sdBaru.map((s) => ({ kode: s.kode, nama: s.nama, indukKode: indukKode(s.kode), khusus: false, aktif: true })),
          { session },
        );
        for (const d of dibuat) master.set(d.kode, d._id);
      }
      const dok = baris.map((b) => ({
        tahapanId: tahapan._id,
        skpdId: b.skpdId,
        subUnitId: b.subUnitId,
        kodeSubkegiatan: b.kode,
        namaSubkegiatan: b.nama,
        pagu: b.pagu,
        status: 'aktif',
        alokasi: b.alokasi.map((a) => ({ sumberDanaId: oid(master.get(a.kode)), nilai: a.nilai, nilaiSipd: 0, asal: 'admin' })),
        alokasiSipd: [],
        beda: { ada: false },
        seimbang: true,
        rincian: [],
      }));
      for (let i = 0; i < dok.length; i += 500) await SubkegiatanTahapan.insertMany(dok.slice(i, i + 500), { session });
      await catatAudit(
        { aksi: 'impor_data_awal', koleksi: 'subkegiatanTahapan', dokumenId: tahapan._id, sesudah: { file: basename(file), subkegiatan: dok.length, totalPagu: total, sumberDanaBaru: sdBaru.map((s) => s.kode) } },
        session,
      );
    });
    await segarkanNotifikasi(tahapan._id);
    const tersimpan = await SubkegiatanTahapan.aggregate<{ n: number; pagu: number; alokasi: number }>([
      { $match: { tahapanId: tahapan._id } },
      { $group: { _id: null, n: { $sum: 1 }, pagu: { $sum: '$pagu' }, alokasi: { $sum: { $sum: '$alokasi.nilai' } } } },
    ]);
    const t = tersimpan[0];
    console.log(`\nTersimpan : ${t.n} subkegiatan, pagu ${rp(t.pagu)}, alokasi ${rp(t.alokasi)}`);
    console.log(t.n === baris.length && t.pagu === total && t.alokasi === total ? 'Cocok dengan file.' : 'PERINGATAN: jumlah tersimpan tidak sama dengan file!');
  }
} catch (e) {
  gagal((e as Error).message);
} finally {
  await putus();
}
