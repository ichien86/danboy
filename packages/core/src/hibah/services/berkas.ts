import { createHash } from 'node:crypto';
import {
  bacaFile, catatAudit, hapusFile, HibahBerkas, HibahBerkasWajib, HibahPenerima, HibahRekomendasi, HibahUsulan, oid, sambung, simpanFile, Skpd,
  type HibahBerkasDoc, type PemilikBerkas,
} from '@danboy/db';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { penyimpanan } from '../drive';
import { bisaDiubahPd, type StatusUsulan } from '../aturan';
import { pastikanIdHibah, ser } from './umum';

export const BATAS_BERKAS = 5 * 1024 * 1024;
const MAKS_PERCOBAAN = 10;

/** Tipe dari magic bytes, bukan dari nama berkas (FR-51). */
export function tipeBerkas(isi: Buffer): { mime: string; ext: string } | null {
  if (isi.subarray(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (isi[0] === 0xff && isi[1] === 0xd8 && isi[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (isi.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mime: 'image/png', ext: 'png' };
  return null;
}

const bersihkanNama = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150) || 'berkas';

export interface MasukBerkas { pemilikJenis: PemilikBerkas; pemilikId: string; jenisDokumen: string; nama: string; isi: Buffer }

/** Pemilik berkas dan siapa yang boleh menambahkan berkas padanya. */
async function muatPemilik(user: SessionUser, jenis: PemilikBerkas, id: string, untukTulis: boolean) {
  const _id = oid(pastikanIdHibah(id, 'Pemilik berkas'));
  const op = peranHibah(user) === 'operator_pd';
  if (jenis === 'usulan') {
    const u = await HibahUsulan.findById(_id, { skpdId: 1, tahun: 1, status: 1, penerimaId: 1 }).lean();
    if (!u || (op && String(u.skpdId) !== user.skpdId)) throw tidakDitemukan('Usulan');
    if (untukTulis && (!op || !bisaDiubahPd(u.status as StatusUsulan))) throw new Galat('VALIDASI', 'Berkas usulan tidak bisa diubah pada status ini');
    return { skpdId: String(u.skpdId), tahun: u.tahun, penerimaId: String(u.penerimaId) };
  }
  if (jenis === 'penerima') {
    const p = await HibahPenerima.findById(_id, { skpdPembuatId: 1 }).lean();
    if (!p) throw tidakDitemukan('Penerima');
    if (op) {
      const milik = String(p.skpdPembuatId) === user.skpdId || (await HibahUsulan.exists({ penerimaId: _id, skpdId: oid(user.skpdId) }));
      if (!milik) throw tidakDitemukan('Penerima');
    } else if (untukTulis) throw new Galat('TIDAK_BERHAK', 'Hanya Operator PD yang menambah berkas penerima');
    return { skpdId: String(p.skpdPembuatId), tahun: null, penerimaId: String(p._id) };
  }
  if (jenis === 'rekomendasi') {
    const r = await HibahRekomendasi.findById(_id, { skpdId: 1, tahun: 1 }).lean();
    if (!r || (op && String(r.skpdId) !== user.skpdId)) throw tidakDitemukan('Rekomendasi');
    return { skpdId: String(r.skpdId), tahun: r.tahun, penerimaId: null };
  }
  if (untukTulis) pastikanBolehHibah(user, 'hibah_cetak_ba');
  return { skpdId: null, tahun: null, penerimaId: null };
}

/** Jalur folder Drive (FR-50): Verifikasi TAPD / TA / PD / Penerima, atau folder Rekomendasi dan Berita Acara. */
async function jalurDrive(b: Pick<HibahBerkasDoc, 'pemilik' | 'skpdId' | 'tahun'>, penerimaId: string | null): Promise<string[]> {
  const ta = `TA ${b.tahun ?? new Date().getFullYear() + 1}`;
  if (b.pemilik.jenis === 'rekomendasi') return [ta, 'Rekomendasi'];
  if (b.pemilik.jenis === 'berita_acara') return [ta, 'Berita Acara'];
  const pd = b.skpdId ? ((await Skpd.findById(b.skpdId, { nama: 1 }).lean())?.nama ?? 'PD') : 'PD';
  const p = penerimaId ? await HibahPenerima.findById(penerimaId, { nama: 1 }).lean() : null;
  return [ta, pd, `${p?.nama ?? 'Penerima'} · ${String(penerimaId ?? '').slice(-6)}`];
}

/** Kirim satu berkas ke Drive; berhasil = salinan GridFS dihapus. Gagal = tetap menunggu (atau gagal setelah 10 kali). */
async function kirimSatu(b: HibahBerkasDoc, penerimaId: string | null, batasMs: number): Promise<boolean> {
  if (!b.gridfsId) return b.status === 'tersimpan';
  const mulai = Date.now();
  const isi = await bacaFile(b.gridfsId);
  const jalur = await jalurDrive(b, penerimaId);
  const nama = `${b.jenisDokumen}_${new Date(b.createdAt ?? Date.now()).toISOString().slice(0, 10)}_${b.nama}`;
  let galat = '';
  for (let i = 0; i < 3; i++) {
    try {
      const driveId = await penyimpanan().simpan(jalur, nama, b.mime, isi);
      await HibahBerkas.findOneAndUpdate({ _id: b._id }, { $set: { driveId, status: 'tersimpan', gridfsId: null, galatTerakhir: '' }, $inc: { percobaan: 1 } });
      await hapusFile(b.gridfsId);
      return true;
    } catch (e) {
      galat = (e as Error).message.slice(0, 300);
      if (Date.now() - mulai + 2 ** i * 1000 > batasMs) break;
      await new Promise((r) => setTimeout(r, 2 ** i * 1000));
    }
  }
  const percobaan = (b.percobaan ?? 0) + 1;
  await HibahBerkas.findOneAndUpdate(
    { _id: b._id },
    { $set: { galatTerakhir: galat, status: percobaan >= MAKS_PERCOBAAN ? 'gagal' : 'menunggu' }, $inc: { percobaan: 1 } },
  );
  return false;
}

/** Terima unggahan: batas 5 MB, tipe PDF/JPG/PNG, disimpan sementara di GridFS lalu diteruskan ke Drive. */
export async function terimaBerkas(user: SessionUser, m: MasukBerkas, opsi: { tanpaHakTulis?: boolean } = {}) {
  await sambung();
  if (!m.isi.length) throw new Galat('VALIDASI', 'Berkas kosong');
  if (m.isi.length > BATAS_BERKAS) throw new Galat('FILE_TERLALU_BESAR', 'Berkas maksimal 5 MB');
  const tipe = tipeBerkas(m.isi);
  if (!tipe) throw new Galat('FORMAT_FILE', 'Berkas harus PDF, JPG, atau PNG');
  const pemilik = await muatPemilik(user, m.pemilikJenis, m.pemilikId, !opsi.tanpaHakTulis);
  const wajib = await HibahBerkasWajib.findOne({ kode: m.jenisDokumen }, { sensitif: 1 }).lean();
  const sensitif = !!wajib?.sensitif || ['ktp', 'kk'].includes(m.jenisDokumen);
  const gridfsId = await simpanFile(bersihkanNama(m.nama), m.isi, { jenis: 'berkas_hibah' });
  const b = await HibahBerkas.create({
    pemilik: { jenis: m.pemilikJenis, id: oid(m.pemilikId) },
    skpdId: pemilik.skpdId ? oid(pemilik.skpdId) : null,
    tahun: pemilik.tahun,
    jenisDokumen: m.jenisDokumen.slice(0, 60),
    nama: bersihkanNama(m.nama),
    mime: tipe.mime,
    ukuran: m.isi.length,
    sha256: createHash('sha256').update(m.isi).digest('hex'),
    gridfsId,
    sensitif,
    diunggahOleh: oid(user.id),
  });
  // dibatasi 8 detik agar tidak melewati batas waktu fungsi Netlify; sisanya dikirim fungsi terjadwal
  await kirimSatu(b.toObject() as HibahBerkasDoc, pemilik.penerimaId, 8000).catch(() => false);
  return ser(await HibahBerkas.findById(b._id, { gridfsId: 0 }).lean());
}

/** Dipanggil fungsi terjadwal: kirim ulang berkas yang masih menunggu. */
export async function kirimBerkasTertunda(batas = 20) {
  await sambung();
  const daftar = await HibahBerkas.find({ status: 'menunggu', gridfsId: { $ne: null } }).sort({ updatedAt: 1 }).limit(batas).lean<HibahBerkasDoc[]>();
  let terkirim = 0;
  for (const b of daftar) {
    let penerimaId: string | null = null;
    if (b.pemilik.jenis === 'penerima') penerimaId = String(b.pemilik.id);
    if (b.pemilik.jenis === 'usulan') penerimaId = String((await HibahUsulan.findById(b.pemilik.id, { penerimaId: 1 }).lean())?.penerimaId ?? '');
    if (await kirimSatu(b, penerimaId, 20_000).catch(() => false)) terkirim++;
  }
  return { diperiksa: daftar.length, terkirim };
}

/** Admin Perencana mengirim ulang berkas berstatus gagal. */
export async function ulangiBerkasGagal(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_kelola_drive');
  await sambung();
  const r = await HibahBerkas.updateMany({ status: 'gagal', gridfsId: { $ne: null } }, { $set: { status: 'menunggu', percobaan: 0 } });
  return { diulang: r.modifiedCount, ...(await kirimBerkasTertunda()) };
}

export async function daftarBerkas(user: SessionUser, pemilikJenis: PemilikBerkas, pemilikId: string) {
  await sambung();
  await muatPemilik(user, pemilikJenis, pemilikId, false);
  return ser(
    await HibahBerkas.find({ 'pemilik.jenis': pemilikJenis, 'pemilik.id': oid(pemilikId), aktif: true }, { gridfsId: 0, sha256: 0 })
      .sort({ createdAt: -1 })
      .lean(),
  );
}

/** Buka berkas lewat modul (FR-52); KTP/KK hanya untuk Operator PD pemilik dan Verifikator, dan dicatat di audit. */
export async function bukaBerkas(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const b = await HibahBerkas.findById(pastikanIdHibah(id, 'Berkas')).lean<HibahBerkasDoc>();
  if (!b || !b.aktif) throw tidakDitemukan('Berkas');
  await muatPemilik(user, b.pemilik.jenis, String(b.pemilik.id), false);
  if (b.sensitif) {
    if (!bolehHibah(user, 'hibah_buka_ktp')) throw tidakDitemukan('Berkas');
    await catatAudit({ aksi: 'buka_berkas', koleksi: 'hibah_berkas', dokumenId: b._id, sesudah: { jenisDokumen: b.jenisDokumen } });
  }
  const isi = b.driveId ? await penyimpanan().ambil(b.driveId) : b.gridfsId ? await bacaFile(b.gridfsId) : null;
  if (!isi) throw tidakDitemukan('Isi berkas');
  return { nama: b.nama, mime: b.mime, isi };
}

export async function hapusBerkas(user: SessionUser, id: string) {
  await sambung();
  const b = await HibahBerkas.findById(pastikanIdHibah(id, 'Berkas')).lean<HibahBerkasDoc>();
  if (!b || !b.aktif) throw tidakDitemukan('Berkas');
  await muatPemilik(user, b.pemilik.jenis, String(b.pemilik.id), true);
  if (b.pemilik.jenis === 'rekomendasi' || b.pemilik.jenis === 'berita_acara') throw new Galat('VALIDASI', 'Berkas bertanda tangan tidak bisa dihapus');
  // berkas di Drive tidak dihapus agar jejaknya tetap ada; hanya dinonaktifkan di modul
  await HibahBerkas.findOneAndUpdate({ _id: b._id }, { $set: { aktif: false } });
  return { ok: true };
}

export async function ringkasanBerkas() {
  await sambung();
  const r = await HibahBerkas.aggregate<{ _id: string; n: number }>([{ $match: { aktif: true } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  return Object.fromEntries(r.map((x) => [x._id, x.n])) as Record<string, number>;
}
