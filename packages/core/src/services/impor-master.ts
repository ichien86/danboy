import type { AnyBulkWriteOperation } from 'mongoose';
import {
  ImporBatch,
  ImporBaris,
  Nomenklatur,
  Rekening,
  SumberDana,
  Tagging,
  bacaFile,
  catatAudit,
  dalamTransaksi,
  oid,
  sambung,
  type ImporBatchDoc,
  type NomenklaturDoc,
} from '@danboy/db';
import { bacaBarisMentah, deteksiJenis, normalHeader, type Sel } from '@danboy/excel';
import { Galat } from '../galat';
import { indukKode, normalisasiKode } from '../kode';
import { parseNomenklatur } from '../nomenklatur';

const teks = (v: Sel | undefined) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

async function semuaBaris(isi: Buffer, namaFile: string): Promise<Sel[][]> {
  const jenis = deteksiJenis(namaFile, isi);
  if (!jenis) throw new Galat('FORMAT_FILE', 'Format file tidak dikenali');
  const out: Sel[][] = [];
  for await (const r of bacaBarisMentah(isi, jenis)) out.push(r);
  return out;
}

async function simpanBaris(batchId: unknown, baris: { noBaris: number; data: Record<string, unknown>; status: 'ok' | 'ditahan'; alasan?: string }[]) {
  await ImporBaris.deleteMany({ batchId });
  for (let i = 0; i < baris.length; i += 1000)
    await ImporBaris.insertMany(
      baris.slice(i, i + 1000).map((b) => ({ ...b, batchId })),
      { ordered: false },
    );
}

/** Job imporMaster:proses — sampai pratinjau; tidak ada master yang berubah sebelum diterapkan. */
export async function prosesMaster(batchId: string) {
  await sambung();
  const batch = await ImporBatch.findOneAndUpdate(
    { _id: oid(batchId), status: 'diunggah' },
    { $set: { status: 'diproses', progres: 5, galat: null } },
    { new: true },
  ).lean<ImporBatchDoc>();
  if (!batch) return;
  try {
    const isi = await bacaFile(batch.fileId);
    const rows = await semuaBaris(isi, batch.namaFile);
    await ImporBatch.updateOne({ _id: batch._id }, { $set: { progres: 40 } });
    let ringkasan: Record<string, unknown>;
    if (batch.jenis === 'nomenklatur') ringkasan = await prosesNomenklatur(batch, rows);
    else if (batch.jenis === 'sumber_dana' || batch.jenis === 'rekening') ringkasan = await prosesKodeNama(batch, rows);
    else if (batch.jenis === 'tagging') ringkasan = await prosesTagging(batch, rows);
    else throw new Galat('VALIDASI', `Jenis impor ${batch.jenis} tidak dikenal`);
    await ImporBatch.updateOne(
      { _id: batch._id },
      { $set: { status: 'pratinjau', progres: 100, ringkasan: { ...(batch.ringkasan ?? {}), ...ringkasan } } },
    );
  } catch (e) {
    await ImporBatch.updateOne({ _id: batch._id }, { $set: { status: 'gagal', progres: 100, galat: (e as Error).message } });
  }
}

async function prosesNomenklatur(batch: ImporBatchDoc, rows: Sel[][]) {
  const versi = String(batch.ringkasan?.versi || batch.namaFile.replace(/\.(xlsx|csv)$/i, '')).slice(0, 80);
  const { item, galat } = parseNomenklatur(rows.map((r) => r.filter((c) => c !== null && String(c).trim() !== '').join(' ')));
  if (!item.length) throw new Galat('FORMAT_FILE', 'Tidak ada baris nomenklatur yang dikenali');
  const aktif = await Nomenklatur.find({ aktif: true }).select('kode nama jenis').lean<NomenklaturDoc[]>();
  const aktifPer = new Map(aktif.map((n) => [n.kode, n]));
  const diFile = new Set(item.map((i) => i.kode));
  let baru = 0;
  let berubahNama = 0;
  const baris = item.map((it, i) => {
    const lama = aktifPer.get(it.kode);
    const aksi = !lama ? 'baru' : lama.nama !== it.nama ? 'berubah_nama' : 'sama';
    if (aksi === 'baru') baru++;
    if (aksi === 'berubah_nama') berubahNama++;
    return { noBaris: i + 1, data: { ...it, aksi, namaLama: lama?.nama }, status: 'ok' as const };
  });
  const hilang = aktif.filter((n) => !diFile.has(n.kode));
  for (const g of galat) baris.push({ noBaris: 100000 + g.noBaris, data: { teks: g.teks, aksi: 'galat' } as never, status: 'ditahan' as never });
  await simpanBaris(batch._id, baris as never);
  const perJenis: Record<string, number> = {};
  for (const it of item) perJenis[it.jenis] = (perJenis[it.jenis] ?? 0) + 1;
  return { versi, jumlah: item.length, perJenis, baru, berubahNama, tidakAdaLagi: hilang.length, contohTidakAdaLagi: hilang.slice(0, 20).map((h) => `${h.kode} ${h.nama}`), barisGagal: galat.length };
}

async function prosesKodeNama(batch: ImporBatchDoc, rows: Sel[][]) {
  const Model = batch.jenis === 'sumber_dana' ? SumberDana : Rekening;
  const ada = new Map((await (Model as typeof Rekening).find().select('kode nama').lean()).map((d) => [d.kode, d.nama]));
  let iKode = 0;
  let iNama = 1;
  let mulai = 0;
  const h = (rows[0] ?? []).map(normalHeader);
  if (h.some((x) => x.includes('KODE'))) {
    iKode = h.findIndex((x) => x.includes('KODE'));
    iNama = h.findIndex((x) => x.includes('NAMA') || x.includes('URAIAN'));
    if (iNama < 0) iNama = iKode + 1;
    mulai = 1;
  }
  const lihat = new Set<string>();
  let baru = 0;
  let berubahNama = 0;
  const baris: { noBaris: number; data: Record<string, unknown>; status: 'ok' | 'ditahan'; alasan?: string }[] = [];
  rows.slice(mulai).forEach((r, i) => {
    const kode = teks(r[iKode]).replace(/\s/g, '');
    const nama = teks(r[iNama]);
    if (!kode && !nama) return;
    if (!kode || !nama || !/^[0-9A-Z.]+$/i.test(kode)) {
      baris.push({ noBaris: i + 1 + mulai, data: { kode, nama, aksi: 'galat' }, status: 'ditahan', alasan: 'Kode atau nama kosong/tidak valid' });
      return;
    }
    if (lihat.has(kode)) return;
    lihat.add(kode);
    const lama = ada.get(kode);
    const aksi = lama === undefined ? 'baru' : lama !== nama ? 'berubah_nama' : 'sama';
    if (aksi === 'baru') baru++;
    if (aksi === 'berubah_nama') berubahNama++;
    baris.push({ noBaris: i + 1 + mulai, data: { kode, nama, indukKode: indukKode(kode), aksi, namaLama: lama }, status: 'ok' });
  });
  if (!lihat.size) throw new Galat('FORMAT_FILE', 'Tidak ada baris kode dan nama yang valid');
  await simpanBaris(batch._id, baris);
  return { jumlah: lihat.size, baru, berubahNama, tidakAdaLagi: [...ada.keys()].filter((k) => !lihat.has(k)).length, barisGagal: baris.filter((b) => b.status === 'ditahan').length };
}

async function prosesTagging(batch: ImporBatchDoc, rows: Sel[][]) {
  const tahun = batch.tahun!;
  let iHeader = rows.findIndex((r) => {
    const h = r.map(normalHeader);
    return h.some((x) => x.startsWith('SUMBER DANA')) && h.some((x) => x.startsWith('KODE SUB'));
  });
  if (iHeader < 0) throw new Galat('FORMAT_FILE', 'Kolom wajib tidak ditemukan: Sumber Dana, Kode Subkegiatan');
  const h = rows[iHeader].map(normalHeader);
  const idx = (pred: (x: string) => boolean) => h.findIndex(pred);
  const k = {
    sd: idx((x) => x.startsWith('SUMBER DANA')),
    kategori: idx((x) => x.startsWith('KATEGORI') || x.startsWith('BIDANG')),
    rincian: idx((x) => x.startsWith('RINCIAN') || x.startsWith('SUBBIDANG')),
    kode: idx((x) => x.startsWith('KODE SUB')),
    nomenklatur: idx((x) => x.startsWith('NOMENKLATUR')),
    kinerja: idx((x) => x.startsWith('KINERJA')),
    indikator: idx((x) => x.startsWith('INDIKATOR')),
    satuan: idx((x) => x.startsWith('SATUAN')),
  };
  const sdList = await SumberDana.find({ aktif: true }).select('kode nama namaTagging').lean();
  const peta = new Map<string, string[]>();
  for (const s of sdList) {
    for (const nama of [s.namaTagging, s.nama]) {
      if (!nama) continue;
      const key = nama.trim().toUpperCase();
      if (nama === s.nama && peta.has(key)) continue;
      peta.set(key, [...(peta.get(key) ?? []), String(s._id)]);
    }
  }
  const ada = new Set(
    (await Tagging.find({ tahun }).select('sumberDanaId kodeSubkegiatan rincian').lean()).map((t) => `${t.sumberDanaId}|${t.kodeSubkegiatan}|${t.rincian}`),
  );
  const belumDipetakan = new Set<string>();
  let baru = 0;
  let sama = 0;
  const baris: { noBaris: number; data: Record<string, unknown>; status: 'ok' | 'ditahan'; alasan?: string }[] = [];
  rows.slice(iHeader + 1).forEach((r, i) => {
    const namaTagging = teks(r[k.sd]);
    const kode = normalisasiKode(teks(r[k.kode]));
    if (!namaTagging && !kode) return;
    const data = {
      namaTagging,
      kodeSubkegiatan: kode,
      kategori: k.kategori >= 0 ? teks(r[k.kategori]) : '',
      rincian: k.rincian >= 0 ? teks(r[k.rincian]) : '',
      nomenklatur: k.nomenklatur >= 0 ? teks(r[k.nomenklatur]) : '',
      kinerja: k.kinerja >= 0 ? teks(r[k.kinerja]) || undefined : undefined,
      indikator: k.indikator >= 0 ? teks(r[k.indikator]) || undefined : undefined,
      satuan: k.satuan >= 0 ? teks(r[k.satuan]) || undefined : undefined,
    };
    const ids = peta.get(namaTagging.toUpperCase());
    const noBaris = iHeader + 2 + i;
    if (!kode) {
      baris.push({ noBaris, data: { ...data, aksi: 'galat' }, status: 'ditahan', alasan: 'Kode subkegiatan kosong' });
      return;
    }
    if (!ids?.length) {
      belumDipetakan.add(namaTagging);
      baris.push({ noBaris, data: { ...data, aksi: 'ditahan' }, status: 'ditahan', alasan: `Nama tagging "${namaTagging}" belum dipetakan ke sumber dana` });
      return;
    }
    const semuaAda = ids.every((id) => ada.has(`${id}|${kode}|${data.rincian}`));
    if (semuaAda) sama++;
    else baru++;
    baris.push({ noBaris, data: { ...data, sumberDanaIds: ids, aksi: semuaAda ? 'sama' : 'baru' }, status: 'ok' });
  });
  await simpanBaris(batch._id, baris);
  return { tahun, jumlah: baris.length, baru, sama, ditahan: baris.filter((b) => b.status === 'ditahan').length, belumDipetakan: [...belumDipetakan].sort() };
}

/** Job imporMaster:terapkan, satu transaksi. */
export async function terapkanMaster(batchId: string) {
  await sambung();
  try {
    await dalamTransaksi(async (session) => {
      const b = await ImporBatch.findOneAndUpdate(
        { _id: oid(batchId), status: 'pratinjau' },
        { $set: { status: 'diterapkan', diterapkanPada: new Date(), 'ringkasan.sedangDiterapkan': false } },
        { new: true, session },
      ).lean<ImporBatchDoc>();
      if (!b) return;
      const cursor = ImporBaris.find({ batchId: b._id, status: 'ok' }).session(session).lean().cursor();
      let ops: AnyBulkWriteOperation[] = [];
      let n = 0;
      const Model = b.jenis === 'nomenklatur' ? Nomenklatur : b.jenis === 'sumber_dana' ? SumberDana : b.jenis === 'rekening' ? Rekening : Tagging;
      const kirim = async () => {
        if (!ops.length) return;
        await (Model as typeof Rekening).bulkWrite(ops as never, { session, ordered: false });
        ops = [];
      };
      const versi = String(b.ringkasan?.versi ?? '');
      for await (const r of cursor) {
        const d = r.data as Record<string, unknown>;
        if (d.aksi === 'sama' && b.jenis !== 'nomenklatur') continue;
        n++;
        if (b.jenis === 'nomenklatur') {
          ops.push({
            updateOne: {
              filter: { versi, kode: d.kode },
              update: { $set: { jenis: d.jenis, nama: d.nama, indukKode: d.indukKode ?? null, aktif: true } },
              upsert: true,
            },
          });
        } else if (b.jenis === 'sumber_dana') {
          ops.push({
            updateOne: { filter: { kode: d.kode }, update: { $set: { nama: d.nama, indukKode: d.indukKode ?? null }, $setOnInsert: { khusus: false, aktif: true } }, upsert: true },
          });
        } else if (b.jenis === 'rekening') {
          ops.push({ updateOne: { filter: { kode: d.kode }, update: { $set: { nama: d.nama } }, upsert: true } });
        } else {
          for (const sid of d.sumberDanaIds as string[]) {
            ops.push({
              updateOne: {
                filter: { tahun: b.tahun, sumberDanaId: oid(sid), kodeSubkegiatan: d.kodeSubkegiatan, rincian: d.rincian ?? '' },
                update: { $set: { kategori: d.kategori ?? '', kinerja: d.kinerja, indikator: d.indikator, satuan: d.satuan, diubahOleh: b.olehId } },
                upsert: true,
              },
            });
          }
        }
        if (ops.length >= 500) await kirim();
      }
      await kirim();
      if (b.jenis === 'nomenklatur') {
        // yang tidak ada lagi ditandai aktif:false (tidak dihapus; mungkin masih dipakai tahapan lama)
        await Nomenklatur.updateMany({ versi: { $ne: versi }, aktif: true }, { $set: { aktif: false } }, { session });
      }
      await catatAudit({ aksi: 'terapkan_impor', koleksi: b.jenis === 'sumber_dana' ? 'sumberDana' : b.jenis, dokumenId: b._id, sesudah: { namaFile: b.namaFile, jumlah: n, versi: versi || undefined } }, session);
    });
  } catch (e) {
    await ImporBatch.updateOne({ _id: oid(batchId) }, { $set: { status: 'gagal', galat: `Gagal menerapkan: ${(e as Error).message}`, 'ringkasan.sedangDiterapkan': false } });
    throw e;
  }
}
