import type { AnyBulkWriteOperation, ClientSession } from 'mongoose';
import {
  Notifikasi,
  PaguSumberDana,
  Skpd,
  SubkegiatanTahapan,
  SumberDana,
  Tagging,
  Tahapan,
  oid,
  sambung,
  type NotifikasiDoc,
  type SubkegiatanTahapanDoc,
  type SumberDanaDoc,
  type TahapanDoc,
  type TingkatNotifikasi,
} from '@danboy/db';
import { formatRupiah } from '../rupiah';
import { kandidatKodeNomenklatur } from '../kode';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { cakupanDb, pastikanId, type Halaman } from './umum';

interface Calon {
  kunciUnik: string;
  aturan: string;
  tingkat: TingkatNotifikasi;
  pesan: string;
  tautan: string;
  skpdId?: unknown;
  subkegiatanTahapanId?: unknown;
  sumberDanaId?: unknown;
  batchId?: unknown;
  detail?: Record<string, unknown>;
}

/** Aturan yang dihitung ulang penuh untuk satu tahapan; R9 dikelola per batch impor. */
const ATURAN_TAHAPAN = ['R2', 'R3', 'R4', 'R5', 'R6', 'R8'];

/**
 * Hitung ulang notifikasi R2, R3, R4, R5, R6, R8 untuk satu tahapan.
 * Upsert berdasarkan kunciUnik: satu masalah = satu notifikasi terbuka; yang masalahnya hilang ditutup otomatis.
 * Notifikasi yang diabaikan Admin tidak dibuat ulang.
 */
export async function segarkanNotifikasi(tahapanId: unknown, session?: ClientSession | null) {
  await sambung();
  const tId = oid(tahapanId);
  const tahapan = await Tahapan.findById(tId).session(session ?? null).lean<TahapanDoc>();
  if (!tahapan) return;
  const [docs, pagu, sdList, tagging] = await Promise.all([
    SubkegiatanTahapan.find({ tahapanId: tId })
      .select('skpdId kodeSubkegiatan namaSubkegiatan pagu alokasi seimbang beda status')
      .session(session ?? null)
      .lean<SubkegiatanTahapanDoc[]>(),
    PaguSumberDana.find({ tahapanId: tId }).session(session ?? null).lean(),
    SumberDana.find().select('kode nama khusus').session(session ?? null).lean<SumberDanaDoc[]>(),
    Tagging.find({ tahun: tahapan.tahun }).select('sumberDanaId kodeSubkegiatan').session(session ?? null).lean(),
  ]);
  const sdPer = new Map(sdList.map((s) => [String(s._id), s]));
  const tagged = new Set(tagging.map((t) => `${t.sumberDanaId}|${t.kodeSubkegiatan}`));
  const sdTaggingPerKode = new Map<string, Set<string>>();
  for (const x of tagging) {
    const set = sdTaggingPerKode.get(x.kodeSubkegiatan) ?? new Set<string>();
    set.add(String(x.sumberDanaId));
    sdTaggingPerKode.set(x.kodeSubkegiatan, set);
  }
  const calon: Calon[] = [];
  const terpakai = new Map<string, number>();
  const t = String(tId);

  for (const d of docs) {
    const id = String(d._id);
    const label = `${d.kodeSubkegiatan} ${d.namaSubkegiatan ?? ''}`.trim();
    if (d.status === 'tidak_ada_di_impor') {
      calon.push({
        kunciUnik: `R8:${t}:${id}`,
        aturan: 'R8',
        tingkat: 'peringatan',
        pesan: `${label} tidak ada di impor SIPD terakhir`,
        tautan: `/subkegiatan?id=${id}`,
        skpdId: d.skpdId,
        subkegiatanTahapanId: d._id,
      });
      continue;
    }
    for (const a of d.alokasi) terpakai.set(String(a.sumberDanaId), (terpakai.get(String(a.sumberDanaId)) ?? 0) + a.nilai);
    if (d.beda?.ada) {
      calon.push({
        kunciUnik: `R2:${t}:${id}`,
        aturan: 'R2',
        tingkat: 'peringatan',
        pesan: `Sumber dana ${label} berbeda dengan SIPD`,
        tautan: `/perbedaan?id=${id}`,
        skpdId: d.skpdId,
        subkegiatanTahapanId: d._id,
      });
    }
    if (!d.seimbang) {
      const total = d.alokasi.reduce((x, a) => x + a.nilai, 0);
      calon.push({
        kunciUnik: `R4:${t}:${id}`,
        aturan: 'R4',
        tingkat: 'peringatan',
        pesan: `Alokasi ${label} belum seimbang: ${formatRupiah(total)} dari pagu ${formatRupiah(d.pagu)}`,
        tautan: `/subkegiatan?id=${id}`,
        skpdId: d.skpdId,
        subkegiatanTahapanId: d._id,
        detail: { jumlahAlokasi: total, pagu: d.pagu, selisih: d.pagu - total },
      });
    }
    for (const a of d.alokasi) {
      const sd = sdPer.get(String(a.sumberDanaId));
      if (!sd?.khusus || a.nilai === 0) continue;
      if (kandidatKodeNomenklatur(d.kodeSubkegiatan).some((k) => tagged.has(`${a.sumberDanaId}|${k}`))) continue;
      calon.push({
        kunciUnik: `R5:${t}:${id}:${a.sumberDanaId}`,
        aturan: 'R5',
        tingkat: 'info',
        pesan: `${label} didanai ${sd.nama} tetapi tidak ada di daftar tagging ${tahapan.tahun}`,
        tautan: `/subkegiatan?id=${id}`,
        skpdId: d.skpdId,
        subkegiatanTahapanId: d._id,
        sumberDanaId: a.sumberDanaId,
      });
    }
    // R6: tertagging untuk sumber dana tertentu, tetapi sumber dana itu tidak dipakai (didanai sumber lain)
    const sdTagging = new Set(kandidatKodeNomenklatur(d.kodeSubkegiatan).flatMap((k) => [...(sdTaggingPerKode.get(k) ?? [])]));
    for (const sid of sdTagging) {
      if (d.alokasi.some((a) => String(a.sumberDanaId) === sid && a.nilai > 0)) continue;
      calon.push({
        kunciUnik: `R6:${t}:${id}:${sid}`,
        aturan: 'R6',
        tingkat: 'peringatan',
        pesan: `${label} tertagging ${sdPer.get(sid)?.nama ?? 'sumber dana khusus'} tetapi didanai sumber lain`,
        tautan: `/subkegiatan?id=${id}`,
        skpdId: d.skpdId,
        subkegiatanTahapanId: d._id,
        sumberDanaId: oid(sid),
      });
    }
  }
  for (const p of pagu) {
    const pakai = terpakai.get(String(p.sumberDanaId)) ?? 0;
    if (pakai <= p.nilai) continue;
    const sd = sdPer.get(String(p.sumberDanaId));
    calon.push({
      kunciUnik: `R3:${t}:${p.sumberDanaId}`,
      aturan: 'R3',
      tingkat: 'kritis',
      pesan: `Pagu ${sd?.nama ?? 'sumber dana'} terlampaui ${formatRupiah(pakai - p.nilai)}`,
      tautan: `/rekap-sumber-dana/${encodeURIComponent(sd?.kode ?? String(p.sumberDanaId))}`,
      sumberDanaId: p.sumberDanaId,
      detail: { pagu: p.nilai, terpakai: pakai, lebih: pakai - p.nilai },
    });
  }

  await terapkanCalon(calon, { tahapanId: tId, aturan: ATURAN_TAHAPAN }, session);
}

/** Upsert calon notifikasi dan tutup notifikasi terbuka dalam lingkup yang tidak lagi bermasalah. */
export async function terapkanCalon(
  calon: Calon[],
  lingkup: { tahapanId?: unknown; aturan: string[]; batchId?: unknown },
  session?: ClientSession | null,
) {
  const filterLingkup: Record<string, unknown> = { aturan: { $in: lingkup.aturan } };
  if (lingkup.tahapanId) filterLingkup.tahapanId = oid(lingkup.tahapanId);
  if (lingkup.batchId) filterLingkup.batchId = oid(lingkup.batchId);
  const diabaikan = new Set(
    (
      await Notifikasi.find({ ...filterLingkup, status: 'diabaikan' })
        .select('kunciUnik')
        .session(session ?? null)
        .lean()
    ).map((n) => n.kunciUnik),
  );
  const kunciAktif = new Set<string>();
  const ops: AnyBulkWriteOperation<NotifikasiDoc>[] = [];
  const sekarang = new Date();
  for (const c of calon) {
    if (diabaikan.has(c.kunciUnik) || kunciAktif.has(c.kunciUnik)) continue;
    kunciAktif.add(c.kunciUnik);
    ops.push({
      updateOne: {
        filter: { kunciUnik: c.kunciUnik, status: 'terbuka' },
        update: {
          $set: { pesan: c.pesan, tingkat: c.tingkat, tautan: c.tautan, detail: c.detail ?? {}, updatedAt: sekarang },
          $setOnInsert: {
            kunciUnik: c.kunciUnik,
            aturan: c.aturan,
            status: 'terbuka',
            tahapanId: lingkup.tahapanId ? oid(lingkup.tahapanId) : null,
            skpdId: (c.skpdId ?? null) as never,
            subkegiatanTahapanId: (c.subkegiatanTahapanId ?? null) as never,
            sumberDanaId: (c.sumberDanaId ?? null) as never,
            batchId: (c.batchId ?? null) as never,
            createdAt: sekarang,
          },
        },
        upsert: true,
      },
    });
  }
  for (let i = 0; i < ops.length; i += 500) {
    await Notifikasi.bulkWrite(ops.slice(i, i + 500), { session: session ?? undefined, ordered: false });
  }
  await Notifikasi.updateMany(
    { ...filterLingkup, status: 'terbuka', kunciUnik: { $nin: [...kunciAktif] } },
    { $set: { status: 'selesai', selesaiPada: sekarang } },
    { session: session ?? undefined },
  );
}

export interface FilterNotifikasi {
  tahapanId?: string;
  status?: 'terbuka' | 'selesai' | 'diabaikan';
  aturan?: string;
  page?: number;
  limit?: number;
}

export async function daftarNotifikasi(user: SessionUser, f: FilterNotifikasi): Promise<Halaman<Record<string, unknown>>> {
  pastikanBoleh(user, 'lihat');
  await sambung();
  const filter: Record<string, unknown> = { ...cakupanDb(user) };
  if (f.tahapanId) filter.tahapanId = oid(pastikanId(f.tahapanId));
  if (f.status) filter.status = f.status;
  if (f.aturan) filter.aturan = f.aturan;
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total] = await Promise.all([
    Notifikasi.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('skpdId', 'kode nama')
      .lean(),
    Notifikasi.countDocuments(filter),
  ]);
  return { data: JSON.parse(JSON.stringify(data)), total, page, limit };
}

export async function hitungNotifikasiTerbuka(user: SessionUser, tahapanId?: string) {
  await sambung();
  const filter: Record<string, unknown> = { status: 'terbuka', ...cakupanDb(user) };
  if (tahapanId) filter.tahapanId = oid(pastikanId(tahapanId));
  const per = await Notifikasi.aggregate<{ _id: string; n: number }>([
    { $match: filter },
    { $group: { _id: '$tingkat', n: { $sum: 1 } } },
  ]);
  const hasil = { total: 0, kritis: 0, peringatan: 0, info: 0 };
  for (const p of per) {
    hasil[p._id as TingkatNotifikasi] = p.n;
    hasil.total += p.n;
  }
  return hasil;
}

export async function abaikanNotifikasi(user: SessionUser, id: string, alasan: string) {
  pastikanBoleh(user, 'ubah_alokasi');
  await sambung();
  const n = await Notifikasi.findOneAndUpdate(
    { _id: oid(pastikanId(id, 'Notifikasi')), status: 'terbuka' },
    { $set: { status: 'diabaikan', alasanAbaikan: alasan, selesaiPada: new Date(), selesaiOleh: oid(user.id) } },
    { new: true },
  ).lean();
  if (!n) throw tidakDitemukan('Notifikasi terbuka');
  return n;
}

export async function namaSkpd(ids: unknown[]) {
  const s = await Skpd.find({ _id: { $in: ids } }).lean();
  return new Map(s.map((x) => [String(x._id), x]));
}

export { Galat };
