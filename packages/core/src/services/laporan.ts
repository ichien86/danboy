import { LogAudit, Notifikasi, SubkegiatanTahapan, oid, sambung } from '@danboy/db';
import { buatXlsx, type SheetEkspor } from '@danboy/excel';
import { pastikanBoleh, type SessionUser } from '../akses';
import { Galat } from '../galat';
import { totalAlokasi } from '../pembanding';
import { matriks, rekapSumberDana } from './anggaran';
import { cakupanDb, muatTahapan, pastikanId } from './umum';

const ser = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export async function daftarAudit(
  user: SessionUser,
  f: { koleksi?: string; dokumenId?: string; userId?: string; aksi?: string; page?: number; limit?: number },
) {
  pastikanBoleh(user, 'lihat_audit');
  await sambung();
  const filter: Record<string, unknown> = {};
  if (f.koleksi) filter.koleksi = f.koleksi;
  if (f.aksi) filter.aksi = f.aksi;
  if (f.dokumenId) filter.dokumenId = oid(pastikanId(f.dokumenId));
  if (f.userId) filter.userId = oid(pastikanId(f.userId));
  const page = f.page ?? 1;
  const limit = Math.min(f.limit ?? 50, 200);
  const [data, total] = await Promise.all([
    LogAudit.find(filter).sort({ waktu: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'nama username').lean(),
    LogAudit.countDocuments(filter),
  ]);
  return ser({ data, total, page, limit });
}

const LABEL_STATUS: Record<string, string> = {
  aman: 'Aman',
  mendekati: 'Mendekati pagu',
  melebihi: 'Melebihi pagu',
  pagu_belum_diisi: 'Pagu belum diisi',
};

export type JenisEkspor = 'rekap' | 'matriks' | 'notifikasi' | 'subkegiatan';

/** GET /api/ekspor/{jenis}: unduh Excel; akun SKPD hanya data sendiri. */
export async function ekspor(user: SessionUser, jenis: JenisEkspor, tahapanId: string): Promise<{ namaFile: string; isi: Buffer }> {
  pastikanBoleh(user, 'ekspor');
  const t = await muatTahapan(tahapanId);
  const judul = `${t.nama} — diunduh ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
  const slug = t.nama.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  let sheets: SheetEkspor[];
  if (jenis === 'rekap') {
    const r = await rekapSumberDana(user, tahapanId);
    sheets = [
      {
        nama: 'Rekap Sumber Dana',
        judul: `Rekap Sumber Dana ${judul}`,
        kolom: [
          { header: 'Kode', key: 'kode', width: 22 },
          { header: 'Sumber Dana', key: 'nama', width: 48 },
          { header: 'Pagu', key: 'pagu', rupiah: true, width: 20 },
          { header: 'Terpakai', key: 'terpakai', rupiah: true, width: 20 },
          ...(user.peran === 'skpd' ? [{ header: 'Terpakai SKPD', key: 'terpakaiSkpd', rupiah: true, width: 20 }] : []),
          { header: 'Sisa', key: 'sisa', rupiah: true, width: 20 },
          { header: 'Jumlah Subkegiatan', key: 'jumlahSubkegiatan', width: 12 },
          { header: 'Status', key: 'statusLabel', width: 20 },
        ],
        baris: r.baris.map((b) => ({ ...b, statusLabel: LABEL_STATUS[b.status] })),
      },
    ];
  } else if (jenis === 'matriks' || jenis === 'subkegiatan') {
    const pertama = await matriks(user, tahapanId, { page: 1, limit: 200 });
    type BarisM = Record<string, unknown> & { alokasi: { sumberDanaId: string; nilai: number }[] };
    const semua = [...pertama.data] as unknown as BarisM[];
    for (let p = 2; (p - 1) * 200 < pertama.total; p++) semua.push(...((await matriks(user, tahapanId, { page: p, limit: 200 })).data as unknown as BarisM[]));
    const kolomSd = (pertama.kolom as unknown as { _id: string; kode: string; nama: string }[]).map((k) => ({ header: `${k.nama} (${k.kode})`, key: `sd_${k._id}`, rupiah: true, width: 18 }));
    sheets = [
      {
        nama: jenis === 'matriks' ? 'Matriks' : 'Subkegiatan',
        judul: `${jenis === 'matriks' ? 'Matriks Subkegiatan × Sumber Dana' : 'Daftar Subkegiatan'} ${judul}`,
        kolom: [
          { header: 'SKPD', key: 'skpd', width: 36 },
          { header: 'Sub Unit', key: 'subUnit', width: 36 },
          { header: 'Kode Subkegiatan', key: 'kodeSubkegiatan', width: 20 },
          { header: 'Nama Subkegiatan', key: 'namaSubkegiatan', width: 48 },
          { header: 'Pagu', key: 'pagu', rupiah: true, width: 18 },
          ...(jenis === 'matriks' ? kolomSd : [{ header: 'Jumlah Alokasi', key: 'jumlahAlokasi', rupiah: true, width: 18 }]),
          { header: 'Seimbang', key: 'seimbangLabel', width: 10 },
          { header: 'Status', key: 'status', width: 16 },
        ],
        baris: semua.map((d) => ({
          ...d,
          skpd: (d.skpdId as { nama?: string })?.nama,
          subUnit: (d.subUnitId as { nama?: string })?.nama,
          jumlahAlokasi: totalAlokasi(d.alokasi),
          seimbangLabel: d.seimbang ? 'Ya' : 'Tidak',
          ...Object.fromEntries(d.alokasi.map((a) => [`sd_${a.sumberDanaId}`, a.nilai])),
        })),
      },
    ];
  } else if (jenis === 'notifikasi') {
    const data = await Notifikasi.find({ tahapanId: t._id, status: 'terbuka', ...cakupanDb(user) }).populate('skpdId', 'nama').sort({ aturan: 1 }).lean();
    sheets = [
      {
        nama: 'Notifikasi',
        judul: `Notifikasi Terbuka ${judul}`,
        kolom: [
          { header: 'Aturan', key: 'aturan', width: 8 },
          { header: 'Tingkat', key: 'tingkat', width: 12 },
          { header: 'SKPD', key: 'skpd', width: 36 },
          { header: 'Pesan', key: 'pesan', width: 90 },
          { header: 'Dibuat', key: 'dibuat', width: 20 },
        ],
        baris: data.map((n) => ({
          ...n,
          skpd: (n.skpdId as unknown as { nama?: string })?.nama ?? '',
          dibuat: new Date(n.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        })),
      },
    ];
  } else {
    throw new Galat('TIDAK_DITEMUKAN', 'Jenis ekspor tidak dikenal');
  }
  void SubkegiatanTahapan;
  return { namaFile: `danboy-${jenis}-${slug}.xlsx`, isi: await buatXlsx(sheets) };
}
