import {
  catatAudit, dalamTransaksi, HibahImpor, HibahJenisPenerima, HibahRiwayat, HibahTahun, oid, sambung, Skpd, WilayahDesa, WilayahKecamatan,
  type HibahImporDoc,
} from '@danboy/db';
import { bacaTabel, buatXlsx, deteksiJenis, GalatFormat, type Sel } from '@danboy/excel';
import { Galat, tidakDitemukan } from '../../galat';
import { pastikanBolehHibah, type SessionUser } from '../../akses';
import { normalisasiNama } from '../aturan';
import { samaran, sidik } from '../rahasia';
import { pastikanIdHibah, ser } from './umum';

const KOLOM_RIWAYAT = [
  'TAHUN', 'KELOMPOK', 'JENIS PENERIMA', 'NAMA PENERIMA', 'NIK / NOMOR BADAN HUKUM', 'ALAMAT', 'DESA/KELURAHAN', 'KECAMATAN',
  'PERANGKAT DAERAH', 'BENTUK', 'NILAI', 'KETERANGAN',
];
const WAJIB_RIWAYAT = ['TAHUN', 'KELOMPOK', 'NAMA PENERIMA', 'DESA/KELURAHAN', 'KECAMATAN', 'PERANGKAT DAERAH', 'BENTUK', 'NILAI'];
const KOLOM_WILAYAH = ['KODE KECAMATAN', 'NAMA KECAMATAN', 'KODE DESA', 'NAMA DESA', 'JENIS'];
const BATAS_IMPOR = 20 * 1024 * 1024;

const teks = (v: Sel) => (v === null || v === undefined ? '' : String(v).trim());
const norm = (s: string) => s.toLowerCase().replace(/^(kecamatan|kec\.?|desa|kelurahan|kel\.?)\s+/, '').replace(/[^a-z0-9]/g, '');
/** Angka dari sel: angka asli, atau teks dengan pemisah ribuan titik. */
function angka(v: Sel): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = teks(v).replace(/^rp\.?\s*/i, '').replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function bacaBaris(isi: Buffer, namaFile: string, kolomWajib: string[]) {
  if (isi.length > BATAS_IMPOR) throw new Galat('FILE_TERLALU_BESAR', 'Berkas impor maksimal 20 MB');
  const jenis = deteksiJenis(namaFile, isi);
  if (!jenis) throw new Galat('FORMAT_FILE', 'Berkas harus .xlsx atau .csv');
  const baris: { noBaris: number; data: Record<string, Sel> }[] = [];
  try {
    for await (const b of bacaTabel(isi, jenis, { kolomWajib })) baris.push(b);
  } catch (e) {
    if (e instanceof GalatFormat) throw new Galat('FORMAT_FILE', `Kolom wajib tidak ditemukan: ${e.kolomHilang.join(', ')}`, { kolomHilang: e.kolomHilang });
    throw e;
  }
  return baris;
}

/** Templat Excel impor (diunduh dari halaman impornya). */
export async function templatImporHibah(jenis: 'riwayat' | 'wilayah' | 'rincian-uang' | 'rincian-barang') {
  const kolom =
    jenis === 'riwayat' ? KOLOM_RIWAYAT : jenis === 'wilayah' ? KOLOM_WILAYAH : jenis === 'rincian-uang' ? ['URAIAN', 'VOLUME', 'SATUAN', 'HARGA SATUAN'] : ['NAMA BARANG', 'SPESIFIKASI', 'VOLUME', 'SATUAN', 'HARGA SATUAN'];
  const contoh: Record<string, Record<string, unknown>> = {
    riwayat: { TAHUN: 2026, KELOMPOK: 'HIBAH', 'JENIS PENERIMA': 'H07', 'NAMA PENERIMA': 'Yayasan Contoh', 'NIK / NOMOR BADAN HUKUM': 'AHU-0000000.AH.01.04', ALAMAT: 'Jl. Contoh 1', 'DESA/KELURAHAN': 'Siswodipuran', KECAMATAN: 'Boyolali', 'PERANGKAT DAERAH': 'Dinas Sosial', BENTUK: 'UANG', NILAI: 25000000, KETERANGAN: '' },
    wilayah: { 'KODE KECAMATAN': '33.09.01', 'NAMA KECAMATAN': 'Selo', 'KODE DESA': '33.09.01.2001', 'NAMA DESA': 'Contoh', JENIS: 'DESA' },
    'rincian-uang': { URAIAN: 'Pembelian bahan', VOLUME: 10, SATUAN: 'paket', 'HARGA SATUAN': 150000 },
    'rincian-barang': { 'NAMA BARANG': 'Kursi roda', SPESIFIKASI: 'Standar, lipat', VOLUME: 2, SATUAN: 'unit', 'HARGA SATUAN': 1500000 },
  };
  const isi = await buatXlsx([{ nama: 'Data', kolom: kolom.map((k) => ({ header: k, key: k, width: Math.max(14, k.length + 4) })), baris: [contoh[jenis]] }]);
  return { namaFile: `templat-impor-${jenis}.xlsx`, isi };
}

/** Rincian aktivitas dari Excel (FR-19); jumlah dihitung ulang server (BR-01). */
export async function rincianDariExcel(user: SessionUser, input: { bentuk: 'uang' | 'barang'; namaFile: string; isi: Buffer }) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  const uang = input.bentuk === 'uang';
  const baris = await bacaBaris(input.isi, input.namaFile, uang ? ['URAIAN', 'VOLUME', 'SATUAN', 'HARGA SATUAN'] : ['NAMA BARANG', 'VOLUME', 'SATUAN', 'HARGA SATUAN']);
  const galat: string[] = [];
  const rincian = baris.flatMap(({ noBaris, data }) => {
    const uraian = teks(uang ? data.URAIAN : data['NAMA BARANG']);
    const volume = angka(data.VOLUME);
    const harga = angka(data['HARGA SATUAN']);
    if (!uraian || !volume || volume <= 0 || harga === null || harga < 0 || !teks(data.SATUAN)) {
      galat.push(`Baris ${noBaris}: uraian, volume (> 0), satuan, dan harga satuan wajib diisi`);
      return [];
    }
    return [{ uraian, spesifikasi: uang ? '' : teks(data.SPESIFIKASI), volume, satuan: teks(data.SATUAN), hargaSatuan: Math.round(harga) }];
  });
  if (galat.length) throw new Galat('VALIDASI', galat[0], { baris: galat.slice(0, 50).join('\n') });
  if (!rincian.length) throw new Galat('VALIDASI', 'Tidak ada baris rincian');
  return rincian;
}

/** FR-09: baca, validasi, dan simpan pratinjau impor riwayat atau wilayah. Belum mengubah data. */
export async function pratinjauImporHibah(user: SessionUser, input: { jenis: 'riwayat' | 'wilayah'; namaFile: string; isi: Buffer }) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const diproses: Record<string, unknown>[] = [];
  const ditahan: { baris: number; alasan: string; data: Record<string, unknown> }[] = [];
  const catatan: { baris: number; pesan: string }[] = [];
  let tahun: number | null = null;
  let jumlahLama = 0;

  if (input.jenis === 'wilayah') {
    const baris = await bacaBaris(input.isi, input.namaFile, ['KODE KECAMATAN', 'NAMA KECAMATAN', 'KODE DESA', 'NAMA DESA']);
    for (const { noBaris, data } of baris) {
      const d = {
        kecamatanKode: teks(data['KODE KECAMATAN']), kecamatanNama: teks(data['NAMA KECAMATAN']), kode: teks(data['KODE DESA']), nama: teks(data['NAMA DESA']),
        jenis: /kel/i.test(teks(data.JENIS)) ? 'kelurahan' : 'desa',
      };
      if (!d.kecamatanKode || !d.kecamatanNama || !d.kode || !d.nama) ditahan.push({ baris: noBaris, alasan: 'Kode dan nama kecamatan serta desa wajib diisi', data: d });
      else diproses.push({ baris: noBaris, ...d });
    }
  } else {
    const baris = await bacaBaris(input.isi, input.namaFile, WAJIB_RIWAYAT);
    const t = await HibahTahun.findOne({ aktif: true }).lean();
    const [jenis, kec, desa, skpd] = await Promise.all([
      HibahJenisPenerima.find({}, { kode: 1, nama: 1, kelompok: 1, identitas: 1 }).lean(),
      WilayahKecamatan.find({}, { kode: 1, nama: 1 }).lean(),
      WilayahDesa.find({}, { kode: 1, nama: 1, kecamatanKode: 1 }).lean(),
      Skpd.find({}, { nama: 1 }).lean(),
    ]);
    const cariJenis = (s: string) => jenis.find((j) => j.kode.toLowerCase() === s.toLowerCase() || norm(j.nama) === norm(s));
    const cariKec = (s: string) => kec.find((k) => k.kode === s || norm(k.nama) === norm(s));
    const cariDesa = (s: string, kc: string) => desa.find((d) => d.kecamatanKode === kc && (d.kode === s || norm(d.nama) === norm(s)));
    const cariPd = (s: string) => skpd.find((p) => norm(p.nama) === norm(s));
    for (const { noBaris, data } of baris) {
      const asli = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v]));
      const th = angka(data.TAHUN);
      const kelompok = teks(data.KELOMPOK).toLowerCase().includes('bansos') || teks(data.KELOMPOK).toLowerCase().includes('sosial') ? 'bansos' : teks(data.KELOMPOK).toLowerCase() === 'hibah' ? 'hibah' : null;
      const nama = teks(data['NAMA PENERIMA']);
      const bentuk = /barang/i.test(teks(data.BENTUK)) ? 'barang' : /uang/i.test(teks(data.BENTUK)) ? 'uang' : null;
      const nilai = angka(data.NILAI);
      const j = cariJenis(teks(data['JENIS PENERIMA']));
      const identitas = teks(data['NIK / NOMOR BADAN HUKUM']).replace(/\s/g, '');
      const k = cariKec(teks(data.KECAMATAN));
      const ds = k ? cariDesa(teks(data['DESA/KELURAHAN']), k.kode) : undefined;
      const alasan: string[] = [];
      if (!th || !Number.isInteger(th)) alasan.push('TAHUN tidak valid');
      else if (t && th >= t.tahun) alasan.push(`TAHUN harus sebelum tahun anggaran aktif (${t.tahun})`);
      if (!kelompok) alasan.push('KELOMPOK harus HIBAH atau BANSOS');
      if (!nama) alasan.push('NAMA PENERIMA kosong');
      if (!bentuk) alasan.push('BENTUK harus UANG atau BARANG');
      if (nilai === null || nilai < 0 || !Number.isInteger(nilai)) alasan.push('NILAI harus bilangan bulat ≥ 0');
      if (j && (j.identitas === 'nik' || j.identitas === 'nik_kk') && identitas && !/^\d{16}$/.test(identitas)) alasan.push('NIK harus 16 digit angka');
      if (!k) alasan.push('KECAMATAN tidak dikenal di master wilayah');
      else if (!ds) alasan.push('DESA/KELURAHAN tidak dikenal di kecamatan itu');
      if (alasan.length) {
        ditahan.push({ baris: noBaris, alasan: alasan.join('; '), data: asli });
        continue;
      }
      if (tahun === null) tahun = th!;
      else if (tahun !== th) {
        ditahan.push({ baris: noBaris, alasan: `Satu berkas hanya untuk satu tahun (${tahun})`, data: asli });
        continue;
      }
      const pd = cariPd(teks(data['PERANGKAT DAERAH']));
      if (!j) catatan.push({ baris: noBaris, pesan: `Jenis penerima "${teks(data['JENIS PENERIMA'])}" tidak dikenal; disimpan sebagai teks` });
      if (!pd) catatan.push({ baris: noBaris, pesan: `Perangkat daerah "${teks(data['PERANGKAT DAERAH'])}" tidak dikenal; disimpan sebagai teks` });
      const jenisId = j?.identitas ?? (/^\d{16}$/.test(identitas) ? 'nik' : 'badan_hukum');
      diproses.push({
        baris: noBaris, tahun: th, kelompok, jenisPenerimaKode: j?.kode ?? null, jenisTeks: teks(data['JENIS PENERIMA']), nama, namaNormal: normalisasiNama(nama),
        // NIK tidak disimpan terbuka, bahkan di pratinjau: hanya sidik dan samaran
        sidikIdentitas: identitas ? sidik(jenisId, identitas) : null, samaran: identitas ? samaran(identitas) : '',
        alamat: teks(data.ALAMAT), kecamatanKode: k!.kode, desaKode: ds!.kode, namaPd: teks(data['PERANGKAT DAERAH']), skpdId: pd?._id ?? null,
        bentuk, nilai, keterangan: teks(data.KETERANGAN),
      });
    }
    if (tahun !== null) jumlahLama = await HibahRiwayat.countDocuments({ tahun });
  }
  const d = await HibahImpor.create({ jenis: input.jenis, tahun, namaFile: input.namaFile.slice(0, 200), diproses, ditahan, catatan, jumlahLama, oleh: oid(user.id) });
  return ringkasImpor(d.toObject());
}

function ringkasImpor(d: HibahImporDoc) {
  return ser({
    _id: d._id, jenis: d.jenis, tahun: d.tahun, namaFile: d.namaFile, status: d.status, jumlahLama: d.jumlahLama,
    jumlahDiproses: d.diproses.length, jumlahDitahan: d.ditahan.length,
    contohDiproses: d.diproses.slice(0, 50), ditahan: d.ditahan.slice(0, 500), catatan: d.catatan.slice(0, 500),
  });
}

export async function lihatImporHibah(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const d = await HibahImpor.findById(pastikanIdHibah(id, 'Impor')).lean<HibahImporDoc>();
  if (!d) throw tidakDitemukan('Impor');
  return ringkasImpor(d);
}

/** Terapkan pratinjau. Riwayat: seluruh tahun itu diganti dalam satu transaksi (FR-10). Wilayah: tambah dan ubah. */
export async function terapkanImporHibah(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const d = await HibahImpor.findById(pastikanIdHibah(id, 'Impor')).lean<HibahImporDoc>();
  if (!d) throw tidakDitemukan('Impor');
  if (d.status !== 'pratinjau') throw new Galat('VALIDASI', 'Impor ini sudah diterapkan atau dibatalkan');
  if (!d.diproses.length) throw new Galat('VALIDASI', 'Tidak ada baris yang bisa diproses');
  let hasil: Record<string, number> = {};
  await dalamTransaksi(async (session) => {
    if (d.jenis === 'riwayat') {
      const hapus = await HibahRiwayat.deleteMany({ tahun: d.tahun }, { session });
      await HibahRiwayat.insertMany(
        d.diproses.map((b) => ({ ...(b as Record<string, unknown>), skpdId: (b as { skpdId?: unknown }).skpdId ? oid((b as { skpdId: unknown }).skpdId) : null, imporId: d._id })),
        { session },
      );
      hasil = { dihapus: hapus.deletedCount, disimpan: d.diproses.length };
    } else {
      let kec = 0;
      let desa = 0;
      const sudah = new Set<string>();
      for (const b of d.diproses as { kecamatanKode: string; kecamatanNama: string; kode: string; nama: string; jenis: string }[]) {
        if (!sudah.has(b.kecamatanKode)) {
          sudah.add(b.kecamatanKode);
          const r = await WilayahKecamatan.updateOne({ kode: b.kecamatanKode, nama: { $ne: b.kecamatanNama } }, { $set: { nama: b.kecamatanNama, aktif: true } }, { upsert: true, session }).catch(async (e) => {
            // kode sudah ada dengan nama sama: tidak ada perubahan
            if ((e as { code?: number }).code === 11000) return { upsertedCount: 0, modifiedCount: 0 };
            throw e;
          });
          kec += r.upsertedCount + r.modifiedCount;
        }
        const r = await WilayahDesa.updateOne(
          { kode: b.kode, $or: [{ nama: { $ne: b.nama } }, { kecamatanKode: { $ne: b.kecamatanKode } }, { jenis: { $ne: b.jenis } }] },
          { $set: { nama: b.nama, kecamatanKode: b.kecamatanKode, jenis: b.jenis, aktif: true } },
          { upsert: true, session },
        ).catch((e) => {
          if ((e as { code?: number }).code === 11000) return { upsertedCount: 0, modifiedCount: 0 };
          throw e;
        });
        desa += r.upsertedCount + r.modifiedCount;
      }
      hasil = { kecamatanBerubah: kec, desaBerubah: desa };
    }
    await HibahImpor.updateOne({ _id: d._id }, { $set: { status: 'diterapkan' } }, { session });
    // satu entri ringkasan per impor, bukan per baris
    await catatAudit({ aksi: `impor_${d.jenis}`, koleksi: d.jenis === 'riwayat' ? 'hibah_riwayat' : 'wilayah', dokumenId: d._id, sesudah: { tahun: d.tahun, ...hasil } }, session);
  });
  return { ok: true, ...hasil };
}

export async function batalImporHibah(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  await HibahImpor.updateOne({ _id: oid(pastikanIdHibah(id, 'Impor')), status: 'pratinjau' }, { $set: { status: 'batal', diproses: [], ditahan: [] } });
  return { ok: true };
}

export async function ringkasRiwayat(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_kelola_master');
  await sambung();
  const r = await HibahRiwayat.aggregate<{ _id: { tahun: number; kelompok: string }; n: number; nilai: number }>([
    { $group: { _id: { tahun: '$tahun', kelompok: '$kelompok' }, n: { $sum: 1 }, nilai: { $sum: '$nilai' } } },
    { $sort: { '_id.tahun': -1, '_id.kelompok': 1 } },
  ]);
  const pd = await HibahRiwayat.aggregate<{ _id: number; pd: string[] }>([{ $group: { _id: '$tahun', pd: { $addToSet: '$namaPd' } } }]);
  const riwayatImpor = await HibahImpor.find({ jenis: 'riwayat' }, { diproses: 0, ditahan: 0, catatan: 0 }).sort({ createdAt: -1 }).limit(20).lean();
  return ser({ ringkas: r, pdPerTahun: pd.map((p) => ({ tahun: p._id, jumlahPd: p.pd.length })), riwayatImpor });
}

