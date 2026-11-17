import {
  PaguSumberDana,
  SubkegiatanTahapan,
  Tagging,
  Tahapan,
  TahunAnggaran,
  catatAudit,
  dalamTransaksi,
  oid,
  sambung,
  type TahapanDoc,
} from '@danboy/db';
import type { TahapanInput } from '@danboy/schema';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat, tidakDitemukan } from '../galat';
import { cariSumberSalinan, namaTahapan, urutanTahapan } from '../tahapan';
import { tambahJob } from './antrean';
import { segarkanNotifikasi } from './notifikasi';
import { ingatTahapan, muatTahapan, pastikanId } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export async function daftarTahun() {
  await sambung();
  return ser(await TahunAnggaran.find().sort({ tahun: -1 }).lean());
}

/** Tahun baru: tagging tahun sebelumnya disalin ke tahun baru, lalu Admin memperbaruinya. */
export async function buatTahun(user: SessionUser, tahun: number) {
  pastikanBoleh(user, 'kelola_tahapan');
  await sambung();
  if (await TahunAnggaran.exists({ tahun })) throw new Galat('VALIDASI', `Tahun ${tahun} sudah ada`);
  return dalamTransaksi(async (session) => {
    const [doc] = await TahunAnggaran.create([{ tahun, status: 'aktif' }], { session });
    const lama = await Tagging.find({ tahun: tahun - 1 }).session(session).lean();
    if (lama.length) {
      const baru = lama.map(({ _id, createdAt, updatedAt, ...r }) => ({ ...r, tahun }));
      for (let i = 0; i < baru.length; i += 500) await Tagging.insertMany(baru.slice(i, i + 500), { session, ordered: false });
      await catatAudit({ aksi: 'salin_tagging', koleksi: 'tagging', sesudah: { dari: tahun - 1, ke: tahun, jumlah: lama.length } }, session);
    }
    return ser(doc.toObject());
  });
}

export async function ubahTahun(user: SessionUser, id: string, status: 'aktif' | 'arsip') {
  pastikanBoleh(user, 'kelola_tahapan');
  await sambung();
  const t = await TahunAnggaran.findOneAndUpdate({ _id: oid(pastikanId(id, 'Tahun')) }, { $set: { status } }, { new: true }).lean();
  if (!t) throw tidakDitemukan('Tahun');
  return ser(t);
}

export async function daftarTahapan(tahun?: number) {
  await sambung();
  const filter = tahun ? { tahun } : {};
  const data = await Tahapan.find(filter).sort({ tahun: -1, urutan: 1 }).lean<TahapanDoc[]>();
  data.forEach(ingatTahapan);
  return ser(data);
}

/**
 * Pilih tahapan aktif dari daftar yang sudah dimuat (tanpa permintaan tambahan ke basis data):
 * id yang diminta, lalu tahapan terbuka terbaru, lalu tahapan terbaru. Sama dengan pilihTahapan.
 */
export function pilihDariDaftar<T extends { _id: unknown; tahun: number; urutan: number; status: string }>(daftar: T[], id?: string | null): T | null {
  const urut = [...daftar].sort((a, b) => b.tahun - a.tahun || b.urutan - a.urutan);
  return (id ? daftar.find((t) => String(t._id) === id) : undefined) ?? urut.find((t) => t.status === 'terbuka') ?? urut[0] ?? null;
}

/** Pilih tahapan aktif: dari parameter, lalu tahapan terbuka terbaru, lalu tahapan terbaru. */
export async function pilihTahapan(id?: string | null): Promise<TahapanDoc | null> {
  await sambung();
  if (id && /^[0-9a-f]{24}$/i.test(id)) {
    const t = await Tahapan.findById(id).lean<TahapanDoc>();
    if (t) return ser(t);
  }
  const terbuka = await Tahapan.findOne({ status: 'terbuka' }).sort({ tahun: -1, urutan: -1 }).lean<TahapanDoc>();
  if (terbuka) return ser(terbuka);
  const terbaru = await Tahapan.findOne().sort({ tahun: -1, urutan: -1 }).lean<TahapanDoc>();
  return terbaru ? ser(terbaru) : null;
}

export async function buatTahapan(user: SessionUser, input: TahapanInput) {
  pastikanBoleh(user, 'kelola_tahapan');
  await sambung();
  if (!(await TahunAnggaran.exists({ tahun: input.tahun }))) await TahunAnggaran.create({ tahun: input.tahun });
  let ke = 1;
  if (input.jenis === 'PERGESERAN') {
    ke = (await Tahapan.countDocuments({ tahun: input.tahun, jenis: 'PERGESERAN' })) + 1;
  } else if (await Tahapan.exists({ tahun: input.tahun, jenis: input.jenis })) {
    throw new Galat('VALIDASI', `Tahapan ${namaTahapan(input.jenis, input.tahun)} sudah ada`);
  }
  const doc = await Tahapan.create({
    tahun: input.tahun,
    jenis: input.jenis,
    ke,
    nama: input.nama || namaTahapan(input.jenis, input.tahun, ke),
    urutan: urutanTahapan(input.jenis, ke),
    jadwalMulai: input.jadwalMulai,
    jadwalSelesai: input.jadwalSelesai,
    status: 'draf',
  });
  return ser(doc.toObject());
}

export async function ubahTahapan(
  user: SessionUser,
  id: string,
  input: { nama?: string; jadwalMulai?: Date; jadwalSelesai?: Date },
) {
  pastikanBoleh(user, 'kelola_tahapan');
  const t = await muatTahapan(id);
  const mulai = input.jadwalMulai ?? t.jadwalMulai;
  const selesai = input.jadwalSelesai ?? t.jadwalSelesai;
  if (new Date(selesai) <= new Date(mulai)) throw new Galat('VALIDASI', 'Jadwal selesai harus setelah mulai');
  const baru = await Tahapan.findOneAndUpdate({ _id: t._id }, { $set: input }, { new: true }).lean();
  return ser(baru);
}

/** Buka manual. Pembukaan pertama memicu salin otomatis (job salinTahapan); pembukaan ulang wajib beralasan. */
export async function bukaTahapan(user: SessionUser, id: string, alasan?: string) {
  pastikanBoleh(user, 'kelola_tahapan');
  const t = await muatTahapan(id);
  if (t.status === 'terbuka') return ser(t);
  if (t.status === 'draf') {
    await Tahapan.updateOne({ _id: t._id }, { $set: { galatSalin: null } });
    await tambahJob('salinTahapan', { tahapanId: String(t._id), userId: user.id });
    return { ...ser(t), sedangDisalin: true };
  }
  if (!alasan || alasan.trim().length < 5) throw new Galat('VALIDASI', 'Alasan membuka ulang wajib diisi (minimal 5 karakter)');
  const baru = await Tahapan.findOneAndUpdate({ _id: t._id }, { $set: { status: 'terbuka', ditutupPada: null } }, { new: true }).lean();
  await catatAudit({ aksi: 'buka_ulang', koleksi: 'tahapan', dokumenId: t._id, sesudah: { alasan } });
  return ser(baru);
}

export async function tutupTahapan(user: SessionUser | null, id: string) {
  if (user) pastikanBoleh(user, 'kelola_tahapan');
  const t = await muatTahapan(id);
  if (t.status !== 'terbuka') throw new Galat('VALIDASI', 'Hanya tahapan terbuka yang bisa ditutup');
  const baru = await Tahapan.findOneAndUpdate(
    { _id: t._id, status: 'terbuka' },
    { $set: { status: 'ditutup', ditutupPada: new Date() } },
    { new: true },
  ).lean();
  return ser(baru);
}

/**
 * Job salinTahapan: dalam satu transaksi menyalin SubkegiatanTahapan dan PaguSumberDana dari tahapan
 * sumber (urutan tepat di bawahnya pada tahun yang sama), lalu membuka tahapan. Hanya bila disalinDari kosong.
 * Bila gagal, transaksi dibatalkan dan tahapan tetap draf dengan galatSalin terisi.
 */
export async function salinDanBuka(tahapanId: string) {
  await sambung();
  try {
    const hasil = await dalamTransaksi(async (session) => {
      const t = await Tahapan.findOne({ _id: oid(tahapanId), status: 'draf' }).session(session).lean<TahapanDoc>();
      if (!t) return null;
      let jumlah = 0;
      let jumlahPagu = 0;
      let sumberId: unknown = t.disalinDari ?? null;
      if (!t.disalinDari) {
        const lain = await Tahapan.find({ tahun: t.tahun, _id: { $ne: t._id } }).session(session).lean<TahapanDoc[]>();
        const sumber = cariSumberSalinan(lain, t);
        if (sumber) {
          sumberId = sumber._id;
          const cursor = SubkegiatanTahapan.find({ tahapanId: sumber._id }).session(session).lean().cursor();
          let blok: Record<string, unknown>[] = [];
          for await (const d of cursor) {
            const { _id, createdAt, updatedAt, ...r } = d as Record<string, unknown>;
            void _id, createdAt, updatedAt;
            blok.push({ ...r, tahapanId: t._id, imporTerakhirId: null });
            if (blok.length === 500) {
              await SubkegiatanTahapan.insertMany(blok, { session });
              jumlah += blok.length;
              blok = [];
            }
          }
          if (blok.length) {
            await SubkegiatanTahapan.insertMany(blok, { session });
            jumlah += blok.length;
          }
          const pagu = await PaguSumberDana.find({ tahapanId: sumber._id }).session(session).lean();
          if (pagu.length) {
            await PaguSumberDana.insertMany(
              pagu.map(({ _id, createdAt, updatedAt, ...r }) => ({ ...r, tahapanId: t._id })),
              { session },
            );
            jumlahPagu = pagu.length;
          }
        }
      }
      await Tahapan.updateOne(
        { _id: t._id },
        {
          $set: {
            status: 'terbuka',
            galatSalin: null,
            ...(t.disalinDari ? {} : { disalinDari: sumberId, disalinPada: sumberId ? new Date() : null }),
          },
        },
        { session },
      );
      await catatAudit(
        { aksi: 'buka_tahapan', koleksi: 'tahapan', dokumenId: t._id, sesudah: { disalinDari: sumberId, subkegiatan: jumlah, pagu: jumlahPagu } },
        session,
      );
      return { tahapanId: String(t._id), jumlah, jumlahPagu };
    });
    if (hasil) await segarkanNotifikasi(hasil.tahapanId);
    return hasil;
  } catch (e) {
    await Tahapan.updateOne({ _id: oid(tahapanId) }, { $set: { galatSalin: (e as Error).message } });
    throw e;
  }
}

/** Cron tiap menit: buka tahapan draf yang jadwalMulai lewat, tutup tahapan terbuka yang jadwalSelesai lewat. */
export async function jalankanJadwal(sekarang = new Date()) {
  await sambung();
  const buka = await Tahapan.find({ status: 'draf', jadwalMulai: { $lte: sekarang }, jadwalSelesai: { $gt: sekarang }, galatSalin: null })
    .select('_id')
    .lean();
  for (const t of buka) await salinDanBuka(String(t._id)).catch((e) => console.error('[jadwal] gagal membuka', t._id, e));
  const tutup = await Tahapan.updateMany(
    { status: 'terbuka', jadwalSelesai: { $lte: sekarang } },
    { $set: { status: 'ditutup', ditutupPada: sekarang } },
  );
  return { dibuka: buka.length, ditutup: tutup.modifiedCount };
}
