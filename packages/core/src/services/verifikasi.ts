import {
  HasilBanding,
  ImporBatch,
  ImporBaris,
  Notifikasi,
  catatAudit,
  Skpd,
  SubkegiatanTahapan,
  SumberDana,
  bacaFile,
  oid,
  sambung,
  type ImporBatchDoc,
} from '@danboy/db';
import { GalatFormat, bacaTabel, buatXlsx, deteksiJenis } from '@danboy/excel';
import { barisApbd } from '@danboy/schema';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { normalisasiKode } from '../kode';
import { parseRupiah } from '../rupiah';
import {
  kunciVerifikasi,
  ringkasVerifikasi,
  verifikasi,
  type DataVerifikasi,
  type HasilVerifikasi,
  type StatusVerifikasi,
} from '../verifikasi';
import { KOLOM_WAJIB_APBD } from './impor';
import { terapkanCalon } from './notifikasi';
import { cakupanDb, escapeRegex, muatTahapan, pastikanId } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const teks = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export const LABEL_STATUS_VERIFIKASI: Record<StatusVerifikasi, string> = {
  sesuai: 'Sesuai',
  nilai_berbeda: 'Nilai per sumber dana berbeda',
  sumber_dana_berbeda: 'Sumber dana berbeda',
  tidak_ada_di_aplikasi: 'Ada di SIPD, tidak ada di aplikasi',
  tidak_ada_di_sipd: 'Ada di aplikasi, tidak ada di SIPD',
};

/**
 * Job verifikasi:proses — membaca rincian APBD SIPD dan membandingkannya dengan alokasi sumber dana
 * tersimpan di tahapan (acuan). Tidak mengubah data anggaran maupun master; boleh untuk tahapan apa pun.
 */
export async function prosesVerifikasi(batchId: string) {
  await sambung();
  const batch = await ImporBatch.findOneAndUpdate(
    { _id: oid(batchId), status: 'diunggah' },
    { $set: { status: 'diproses', progres: 1, galat: null } },
    { new: true },
  ).lean<ImporBatchDoc>();
  if (!batch) return;
  const set = (s: Record<string, unknown>) => ImporBatch.updateOne({ _id: batch._id }, { $set: s });
  try {
    const tahapan = await muatTahapan(batch.tahapanId);
    const isi = await bacaFile(batch.fileId);
    const jenisFile = deteksiJenis(batch.namaFile, isi);
    if (!jenisFile) throw new Galat('FORMAT_FILE', 'Format file tidak dikenali');
    // "Cek ulang" batch yang sama: centang SKPD dipertahankan bila temuan subkegiatan itu tidak berubah
    const centangLama = new Map<string, { sig: string; tindakLanjut: unknown }>();
    for (const h of await HasilBanding.find({ batchId: batch._id, 'tindakLanjut.selesai': true }).select('kunci aturan verifikasi.baris tindakLanjut').lean()) {
      centangLama.set(h.kunci, { sig: `${h.aturan}|${JSON.stringify((h.verifikasi as { baris?: unknown })?.baris ?? [])}`, tindakLanjut: h.tindakLanjut });
    }
    await ImporBaris.deleteMany({ batchId: batch._id });
    await HasilBanding.deleteMany({ batchId: batch._id });

    const sdList = await SumberDana.find().select('kode nama').lean();
    const namaSd = new Map(sdList.map((s) => [s.kode, s.nama]));
    const namaSdSipd = new Map<string, string>();

    // ---- sisi SIPD ----
    const sipd = new Map<string, DataVerifikasi>();
    let barisTotal = 0;
    let barisOk = 0;
    let tahunSalah = 0;
    let totalPaguSipd = 0;
    const ditahan: Record<string, unknown>[] = [];
    for await (const { noBaris, data } of bacaTabel(isi, jenisFile, { kolomWajib: KOLOM_WAJIB_APBD })) {
      barisTotal++;
      const pagu = parseRupiah(data['PAGU']);
      const v = barisApbd.safeParse({ ...Object.fromEntries(KOLOM_WAJIB_APBD.map((k) => [k, teks(data[k])])), TAHUN: data['TAHUN'], PAGU: pagu });
      let alasan: string | undefined;
      if (!v.success) alasan = v.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      else if (v.data.TAHUN !== tahapan.tahun) {
        tahunSalah++;
        alasan = `TAHUN ${v.data.TAHUN} tidak sama dengan tahun tahapan ${tahapan.tahun}`;
      }
      if (alasan) {
        ditahan.push({ batchId: batch._id, noBaris, data: { kodeSubkegiatan: teks(data['KODE SUB KEGIATAN']), namaSubkegiatan: teks(data['NAMA SUB KEGIATAN']), pagu }, status: 'ditahan', alasan });
        continue;
      }
      barisOk++;
      const r = v.data!;
      const kodeSub = normalisasiKode(r['KODE SUB KEGIATAN']);
      const kunci = kunciVerifikasi(r['KODE SUB UNIT'], kodeSub);
      let e = sipd.get(kunci);
      if (!e) {
        e = {
          kodeSkpd: r['KODE SKPD'],
          namaSkpd: r['NAMA SKPD'],
          kodeSubUnit: r['KODE SUB UNIT'],
          namaSubUnit: r['NAMA SUB UNIT'],
          kodeSubkegiatan: kodeSub,
          namaSubkegiatan: r['NAMA SUB KEGIATAN'],
          pagu: 0,
          alokasi: [],
          rincian: [],
        };
        sipd.set(kunci, e);
      }
      e.pagu += r.PAGU;
      totalPaguSipd += r.PAGU;
      e.alokasi.push({ kode: r['KODE SUMBER DANA'], nilai: r.PAGU });
      if (!namaSdSipd.has(r['KODE SUMBER DANA'])) namaSdSipd.set(r['KODE SUMBER DANA'], r['NAMA SUMBER DANA']);
      e.rincian!.push({
        kodeRekening: r['KODE REKENING'],
        kodeSumberDana: r['KODE SUMBER DANA'],
        namaSumberDana: r['NAMA SUMBER DANA'],
        paket: teks(data['PAKET'] ?? data['KODE PAKET']) || undefined,
        namaPaket: teks(data['NAMA PAKET']) || undefined,
        pagu: r.PAGU,
      });
      if (barisTotal % 2000 === 0) await set({ progres: Math.min(60, 5 + Math.floor(barisTotal / 250)), 'ringkasan.barisDibaca': barisTotal });
    }
    if (barisTotal === 0) throw new Galat('FORMAT_FILE', 'File tidak berisi baris data');
    if (barisOk === 0 && tahunSalah > 0) throw new Galat('FORMAT_FILE', `TAHUN di file tidak cocok dengan tahun tahapan ${tahapan.tahun}`);
    for (let i = 0; i < ditahan.length; i += 1000) await ImporBaris.insertMany(ditahan.slice(i, i + 1000), { ordered: false });
    await set({ progres: 65 });

    // ---- sisi aplikasi (acuan) ----
    const docs = await SubkegiatanTahapan.find({ tahapanId: tahapan._id })
      .select('kodeSubkegiatan namaSubkegiatan pagu alokasi skpdId subUnitId')
      .populate('skpdId', 'kode nama')
      .populate('subUnitId', 'kode nama')
      .lean();
    const kodeSdPer = new Map(sdList.map((s) => [String(s._id), s.kode]));
    const aplikasi = new Map<string, DataVerifikasi>();
    for (const d of docs) {
      const su = d.subUnitId as unknown as { kode: string; nama: string } | null;
      const sk = d.skpdId as unknown as { kode: string; nama: string } | null;
      if (!su || !sk) continue;
      aplikasi.set(kunciVerifikasi(su.kode, d.kodeSubkegiatan), {
        kodeSkpd: sk.kode,
        namaSkpd: sk.nama,
        kodeSubUnit: su.kode,
        namaSubUnit: su.nama,
        kodeSubkegiatan: d.kodeSubkegiatan,
        namaSubkegiatan: d.namaSubkegiatan,
        pagu: d.pagu,
        alokasi: d.alokasi.map((a) => ({ kode: kodeSdPer.get(String(a.sumberDanaId)) ?? String(a.sumberDanaId), nilai: a.nilai })),
      });
    }

    const hasil = verifikasi(aplikasi, sipd);
    const ringkas = ringkasVerifikasi(hasil);
    await set({ progres: 85 });

    const skpdPer = new Map((await Skpd.find().select('kode').lean()).map((s) => [s.kode, s._id]));
    const urut: Record<StatusVerifikasi, number> = { sumber_dana_berbeda: 0, nilai_berbeda: 1, tidak_ada_di_sipd: 2, tidak_ada_di_aplikasi: 3, sesuai: 4 };
    const dokumen = hasil.map((h) => {
      const lama = centangLama.get(h.kunci);
      const tetapDicentang = h.status !== 'sesuai' && lama?.sig === `${h.status}|${JSON.stringify(h.baris)}`;
      return {
      tindakLanjut: tetapDicentang ? lama!.tindakLanjut : { selesai: false, oleh: null, pada: null },
      batchId: batch._id,
      kunci: h.kunci,
      aturan: h.status,
      skpdId: skpdPer.get(h.kodeSkpd),
      kodeSubkegiatan: h.kodeSubkegiatan,
      namaSubkegiatan: h.namaSubkegiatan,
      sebelum: { pagu: h.paguAplikasi },
      sesudah: { pagu: h.paguSipd },
      operasi: null,
      verifikasi: {
        urut: urut[h.status],
        kodeSkpd: h.kodeSkpd,
        namaSkpd: h.namaSkpd,
        kodeSubUnit: h.kodeSubUnit,
        namaSubUnit: h.namaSubUnit,
        baris: h.baris,
        rincianSalah: h.rincianSalah,
      },
      };
    });
    for (let i = 0; i < dokumen.length; i += 500) await HasilBanding.insertMany(dokumen.slice(i, i + 500), { ordered: false });

    // nama sumber dana untuk tampilan: master lebih dulu, lalu nama dari file SIPD
    const kodeDipakai = new Set(hasil.flatMap((h) => h.baris.map((b) => b.kodeSumberDana)));
    const namaSumberDana = Object.fromEntries([...kodeDipakai].map((k) => [k, namaSd.get(k) ?? namaSdSipd.get(k) ?? k]));
    const kodeSdAsing = [...kodeDipakai].filter((k) => !namaSd.has(k)).sort();

    // notifikasi per SKPD: satu notifikasi terbuka per SKPD per tahapan, diganti oleh verifikasi terbaru;
    // hanya SKPD yang masih punya subkegiatan belum sesuai DAN belum dicentang
    const sisaPer = new Map<string, number>();
    for (const d of dokumen) {
      if (d.aturan === 'sesuai' || (d.tindakLanjut as { selesai?: boolean })?.selesai) continue;
      sisaPer.set(d.verifikasi.kodeSkpd, (sisaPer.get(d.verifikasi.kodeSkpd) ?? 0) + 1);
    }
    await terapkanCalon(
      ringkas.perSkpd
        .filter((s) => (sisaPer.get(s.kodeSkpd) ?? 0) > 0 && skpdPer.has(s.kodeSkpd))
        .map((s) => calonNotifVS(String(tahapan._id), String(batch._id), String(skpdPer.get(s.kodeSkpd)), s.namaSkpd, sisaPer.get(s.kodeSkpd)!, s.tidakSesuai)),
      { tahapanId: tahapan._id, aturan: ['VS'] },
    );

    await set({
      status: 'selesai',
      progres: 100,
      ringkasan: {
        barisTotal,
        barisOk,
        barisDitahan: ditahan.length,
        totalPaguSipd,
        totalPaguAplikasi: [...aplikasi.values()].reduce((a, b) => a + b.pagu, 0),
        ...ringkas,
        perSkpd: ringkas.perSkpd.map((s) => ({ ...s, skpdId: skpdPer.get(s.kodeSkpd) ? String(skpdPer.get(s.kodeSkpd)) : null })),
        namaSumberDana,
        kodeSdAsing,
      },
    });
  } catch (e) {
    const pesan = e instanceof GalatFormat ? `Kolom wajib tidak ditemukan: ${e.kolomHilang.join(', ')}` : e instanceof Error ? e.message : String(e);
    await set({ status: 'gagal', galat: pesan, progres: 100 });
  }
}

async function muatBatchVerifikasi(batchId: string) {
  await sambung();
  const b = await ImporBatch.findOne({ _id: oid(pastikanId(batchId, 'Verifikasi')), jenis: 'verifikasi' })
    .populate('olehId', 'nama')
    .populate('tahapanId', 'nama status tahun')
    .lean();
  if (!b) throw tidakDitemukan('Verifikasi');
  return b;
}

type RingkasanBatch = { perSkpd?: { skpdId: string | null }[] } & Record<string, unknown>;

/** Akun SKPD hanya melihat ringkasan dan hasil SKPD-nya sendiri. */
function batasiRingkasan(user: SessionUser, ringkasan: RingkasanBatch) {
  if (user.peran !== 'skpd') return ringkasan;
  const milik = (ringkasan.perSkpd ?? []).filter((s) => s.skpdId === user.skpdId);
  return { ...ringkasan, perSkpd: milik, perStatus: undefined, jumlah: undefined, sesuai: undefined, tidakSesuai: undefined, totalPaguSipd: undefined, totalPaguAplikasi: undefined, barisTotal: undefined, barisOk: undefined, barisDitahan: undefined };
}

export async function daftarVerifikasi(user: SessionUser, tahapanId: string, f: { page?: number; limit?: number } = {}) {
  pastikanBoleh(user, 'lihat');
  const t = await muatTahapan(tahapanId);
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 20, 100);
  const filter = { jenis: 'verifikasi', tahapanId: t._id, status: { $in: user.peran === 'skpd' ? ['selesai'] : ['diunggah', 'diproses', 'selesai', 'gagal'] } };
  const [data, total] = await Promise.all([
    ImporBatch.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('olehId', 'nama').lean(),
    ImporBatch.countDocuments(filter),
  ]);
  return ser({ data: data.map((b) => ({ ...b, ringkasan: batasiRingkasan(user, b.ringkasan as RingkasanBatch) })), total, page, limit });
}

export interface FilterHasilVerifikasi {
  status?: StatusVerifikasi | 'tidak_sesuai';
  /** belum = belum dicentang "sudah disesuaikan di SIPD"; sudah = sudah dicentang */
  tandai?: 'belum' | 'sudah';
  skpd?: string;
  q?: string;
  page?: number;
  limit?: number;
}

function filterHasil(user: SessionUser, batchId: unknown, f: FilterHasilVerifikasi) {
  const filter: Record<string, unknown> = { batchId, ...cakupanDb(user) };
  if (f.status === 'tidak_sesuai') filter.aturan = { $ne: 'sesuai' };
  else if (f.status) filter.aturan = f.status;
  if (f.tandai === 'sudah') filter['tindakLanjut.selesai'] = true;
  else if (f.tandai === 'belum') filter['tindakLanjut.selesai'] = { $ne: true };
  if (f.skpd && user.peran !== 'skpd') filter['verifikasi.kodeSkpd'] = f.skpd;
  if (f.q) {
    const q = escapeRegex(f.q);
    filter.$or = [{ kodeSubkegiatan: { $regex: `^${q}` } }, { namaSubkegiatan: { $regex: q, $options: 'i' } }];
  }
  return filter;
}

export async function hasilVerifikasi(user: SessionUser, batchId: string, f: FilterHasilVerifikasi = {}) {
  pastikanBoleh(user, 'lihat');
  const b = await muatBatchVerifikasi(batchId);
  if (user.peran === 'skpd' && b.status !== 'selesai') throw tidakDitemukan('Verifikasi');
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const filter = filterHasil(user, b._id, f);
  const [data, total, tindakLanjut] = await Promise.all([
    HasilBanding.find(filter)
      .sort({ 'tindakLanjut.selesai': 1, 'verifikasi.urut': 1, 'verifikasi.kodeSkpd': 1, kodeSubkegiatan: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('tindakLanjut.oleh', 'nama')
      .lean(),
    HasilBanding.countDocuments(filter),
    progresTindakLanjut(user, b._id),
  ]);
  return ser({ batch: { ...b, ringkasan: batasiRingkasan(user, b.ringkasan as RingkasanBatch) }, data, total, page, limit, tindakLanjut });
}

/** Per SKPD: jumlah subkegiatan belum sesuai dan berapa yang sudah dicentang "sudah disesuaikan di SIPD". */
export async function progresTindakLanjut(user: SessionUser, batchId: unknown) {
  const rows = await HasilBanding.aggregate<{ _id: string; tidakSesuai: number; ditandai: number }>([
    { $match: { batchId, aturan: { $ne: 'sesuai' }, ...cakupanDb(user) } },
    {
      $group: {
        _id: '$verifikasi.kodeSkpd',
        tidakSesuai: { $sum: 1 },
        ditandai: { $sum: { $cond: [{ $eq: ['$tindakLanjut.selesai', true] }, 1, 0] } },
      },
    },
  ]);
  const perSkpd = Object.fromEntries(rows.map((r) => [r._id, { tidakSesuai: r.tidakSesuai, ditandai: r.ditandai, sisa: r.tidakSesuai - r.ditandai }]));
  const total = rows.reduce((a, r) => ({ tidakSesuai: a.tidakSesuai + r.tidakSesuai, ditandai: a.ditandai + r.ditandai }), { tidakSesuai: 0, ditandai: 0 });
  return { ...total, sisa: total.tidakSesuai - total.ditandai, perSkpd };
}

function calonNotifVS(tahapanId: string, batchId: string, skpdId: string, namaSkpd: string, sisa: number, tidakSesuai: number) {
  return {
    kunciUnik: `VS:${tahapanId}:${skpdId}`,
    aturan: 'VS',
    tingkat: 'peringatan' as const,
    pesan: `${sisa} subkegiatan ${namaSkpd} belum sama sumber dananya dengan aplikasi; sesuaikan di SIPD lalu centang di daftar`,
    tautan: `/verifikasi/${batchId}?tandai=belum`,
    skpdId: oid(skpdId),
    batchId: oid(batchId),
    detail: { sisa, tidakSesuai, ditandai: tidakSesuai - sisa },
  };
}

/**
 * Centang/batal centang pengingat "sudah disesuaikan di SIPD". Hanya pengingat: tidak mengubah data anggaran,
 * dan tidak dibatasi status tahapan. Akun SKPD hanya untuk subkegiatan SKPD-nya. Notifikasi SKPD ikut diperbarui:
 * jumlah sisa di pesannya berkurang, dan tertutup bila semua sudah dicentang.
 */
export async function tandaiHasilVerifikasi(user: SessionUser, batchId: string, hasilId: string, selesai: boolean) {
  pastikanBoleh(user, 'tandai_verifikasi');
  const b = await muatBatchVerifikasi(batchId);
  if (b.status !== 'selesai') throw new Galat('DATA_BERUBAH', 'Verifikasi belum selesai');
  const h = await HasilBanding.findOne({ _id: oid(pastikanId(hasilId, 'Hasil verifikasi')), batchId: b._id, ...cakupanDb(user) }).lean();
  if (!h) throw tidakDitemukan('Hasil verifikasi');
  if (h.aturan === 'sesuai') throw new Galat('VALIDASI', 'Subkegiatan ini sudah sesuai; tidak perlu ditandai');
  const tindakLanjut = selesai ? { selesai: true, oleh: oid(user.id), pada: new Date() } : { selesai: false, oleh: null, pada: null };
  await HasilBanding.updateOne({ _id: h._id }, { $set: { tindakLanjut } });
  await catatAudit({
    aksi: selesai ? 'tandai_sudah_disesuaikan_sipd' : 'batal_tandai_sipd',
    koleksi: 'hasilBanding',
    dokumenId: h._id,
    sesudah: { batchId: String(b._id), kodeSubkegiatan: h.kodeSubkegiatan, selesai },
  });
  if (h.skpdId) await segarkanNotifVS(b as unknown as { _id: unknown; tahapanId: { _id: unknown } }, h.skpdId, user.id);
  const p = await progresTindakLanjut(user, b._id);
  return { ok: true, tindakLanjut: ser(tindakLanjut), progres: p };
}

/** Perbarui notifikasi VS satu SKPD; hanya bila batch ini verifikasi terbaru untuk tahapannya. */
async function segarkanNotifVS(b: { _id: unknown; tahapanId: { _id: unknown } }, skpdId: unknown, olehId: string) {
  const tahapanId = b.tahapanId?._id ?? b.tahapanId;
  const terbaru = await ImporBatch.findOne({ jenis: 'verifikasi', tahapanId, status: 'selesai' }).sort({ createdAt: -1 }).select('_id').lean();
  if (!terbaru || String(terbaru._id) !== String(b._id)) return;
  const dasar = { batchId: b._id, skpdId, aturan: { $ne: 'sesuai' } };
  const [tidakSesuai, sisa, contoh] = await Promise.all([
    HasilBanding.countDocuments(dasar),
    HasilBanding.countDocuments({ ...dasar, 'tindakLanjut.selesai': { $ne: true } }),
    HasilBanding.findOne(dasar).select('verifikasi.namaSkpd').lean(),
  ]);
  const kunciUnik = `VS:${tahapanId}:${skpdId}`;
  if (sisa === 0) {
    await Notifikasi.updateMany({ kunciUnik, status: 'terbuka' }, { $set: { status: 'selesai', selesaiPada: new Date(), selesaiOleh: oid(olehId) } });
    return;
  }
  const c = calonNotifVS(String(tahapanId), String(b._id), String(skpdId), (contoh?.verifikasi as { namaSkpd?: string })?.namaSkpd ?? 'SKPD', sisa, tidakSesuai);
  await Notifikasi.updateOne(
    { kunciUnik, status: 'terbuka' },
    {
      $set: { pesan: c.pesan, tautan: c.tautan, detail: c.detail, tingkat: c.tingkat },
      $setOnInsert: { kunciUnik, aturan: 'VS', status: 'terbuka', tahapanId: oid(tahapanId), skpdId: c.skpdId, batchId: c.batchId },
    },
    { upsert: true },
  );
}

/** Excel untuk dikirim ke SKPD: ringkasan, selisih per sumber dana, dan baris rekening yang salah sumber dana. */
export async function eksporVerifikasi(user: SessionUser, batchId: string): Promise<{ namaFile: string; isi: Buffer }> {
  pastikanBoleh(user, 'ekspor');
  const b = await muatBatchVerifikasi(batchId);
  if (b.status !== 'selesai') throw new Galat('DATA_BERUBAH', 'Verifikasi belum selesai');
  const ringkasan = batasiRingkasan(user, b.ringkasan as RingkasanBatch) as unknown as {
    perSkpd: { kodeSkpd: string; namaSkpd: string; jumlah: number; tidakSesuai: number; perStatus: Record<StatusVerifikasi, number> }[];
    namaSumberDana: Record<string, string>;
  };
  const nama = ringkasan.namaSumberDana ?? {};
  const docs = await HasilBanding.find(filterHasil(user, b._id, { status: 'tidak_sesuai' }))
    .sort({ 'verifikasi.kodeSkpd': 1, 'verifikasi.urut': 1, kodeSubkegiatan: 1 })
    .lean();
  const barisSd: Record<string, unknown>[] = [];
  const barisRincian: Record<string, unknown>[] = [];
  for (const d of docs) {
    const v = d.verifikasi as unknown as { kodeSkpd: string; namaSkpd: string; kodeSubUnit: string; namaSubUnit: string; baris: HasilVerifikasi['baris']; rincianSalah: HasilVerifikasi['rincianSalah'] };
    const dasar = { skpd: v.namaSkpd, subUnit: v.namaSubUnit, kodeSubkegiatan: d.kodeSubkegiatan, namaSubkegiatan: d.namaSubkegiatan, status: LABEL_STATUS_VERIFIKASI[d.aturan as StatusVerifikasi] };
    for (const x of v.baris) {
      if (x.selisih === 0) continue;
      barisSd.push({ ...dasar, kodeSumberDana: x.kodeSumberDana, sumberDana: nama[x.kodeSumberDana] ?? x.kodeSumberDana, nilaiAplikasi: x.nilaiAplikasi, nilaiSipd: x.nilaiSipd, selisih: x.selisih });
    }
    for (const r of v.rincianSalah) {
      barisRincian.push({ ...dasar, kodeRekening: r.kodeRekening, paket: r.namaPaket || r.paket || '', kodeSumberDana: r.kodeSumberDana, sumberDana: r.namaSumberDana ?? nama[r.kodeSumberDana] ?? '', pagu: r.pagu });
    }
  }
  const t = b.tahapanId as unknown as { nama: string };
  const judul = `Verifikasi input SIPD terhadap ${t?.nama ?? 'tahapan'} — file ${b.namaFile}`;
  const isi = await buatXlsx([
    {
      nama: 'Ringkasan per SKPD',
      judul,
      kolom: [
        { header: 'Kode SKPD', key: 'kodeSkpd', width: 26 },
        { header: 'SKPD', key: 'namaSkpd', width: 44 },
        { header: 'Subkegiatan', key: 'jumlah', width: 12 },
        { header: 'Tidak sesuai', key: 'tidakSesuai', width: 12 },
        { header: 'Sumber dana berbeda', key: 'sdb', width: 14 },
        { header: 'Nilai berbeda', key: 'nb', width: 12 },
        { header: 'Tidak ada di SIPD', key: 'tas', width: 14 },
        { header: 'Tidak ada di aplikasi', key: 'taa', width: 14 },
      ],
      baris: ringkasan.perSkpd.map((s) => ({
        ...s,
        sdb: s.perStatus.sumber_dana_berbeda,
        nb: s.perStatus.nilai_berbeda,
        tas: s.perStatus.tidak_ada_di_sipd,
        taa: s.perStatus.tidak_ada_di_aplikasi,
      })),
    },
    {
      nama: 'Selisih per sumber dana',
      judul,
      kolom: [
        { header: 'SKPD', key: 'skpd', width: 36 },
        { header: 'Sub Unit', key: 'subUnit', width: 36 },
        { header: 'Kode Subkegiatan', key: 'kodeSubkegiatan', width: 20 },
        { header: 'Nama Subkegiatan', key: 'namaSubkegiatan', width: 48 },
        { header: 'Status', key: 'status', width: 30 },
        { header: 'Kode Sumber Dana', key: 'kodeSumberDana', width: 18 },
        { header: 'Sumber Dana', key: 'sumberDana', width: 34 },
        { header: 'Seharusnya (aplikasi)', key: 'nilaiAplikasi', rupiah: true, width: 20 },
        { header: 'Di SIPD', key: 'nilaiSipd', rupiah: true, width: 20 },
        { header: 'Selisih (SIPD − aplikasi)', key: 'selisih', rupiah: true, width: 22 },
      ],
      baris: barisSd,
    },
    {
      nama: 'Rekening salah sumber dana',
      judul,
      kolom: [
        { header: 'SKPD', key: 'skpd', width: 36 },
        { header: 'Sub Unit', key: 'subUnit', width: 36 },
        { header: 'Kode Subkegiatan', key: 'kodeSubkegiatan', width: 20 },
        { header: 'Nama Subkegiatan', key: 'namaSubkegiatan', width: 48 },
        { header: 'Kode Rekening', key: 'kodeRekening', width: 22 },
        { header: 'Paket', key: 'paket', width: 30 },
        { header: 'Sumber Dana di SIPD', key: 'sumberDana', width: 34 },
        { header: 'Pagu', key: 'pagu', rupiah: true, width: 18 },
      ],
      baris: barisRincian,
    },
  ]);
  return { namaFile: `danboy-verifikasi-sipd-${String(b._id).slice(-6)}.xlsx`, isi };
}
