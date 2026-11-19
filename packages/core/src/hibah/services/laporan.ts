import { createHash } from 'node:crypto';
import {
  HibahBeritaAcara, HibahDrive, HibahJenisPenerima, HibahPenerima, HibahRekomendasi, HibahSusunan, HibahTahun, HibahUsulan,
  LogAudit, oid, sambung, Skpd, WilayahDesa, WilayahKecamatan,
  type HibahBeritaAcaraDoc, type HibahTahunDoc, type HibahUsulanDoc,
} from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { isiTemplat } from '@danboy/cetak';
import { buatXlsx } from '@danboy/excel';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { escapeRegex } from '../../services/umum';
import { KODE_ASPEK, LABEL_STATUS_USULAN, normalisasiNama, terbilang, type StatusUsulan } from '../aturan';
import { ringkasanBerkas, terimaBerkas } from './berkas';
import { ambilTemplat } from './master';
import { rpTeks, tanggalPanjang } from './rekomendasi';
import { ambilJadwal } from './tahun';
import { cakupanDbHibah, petaNamaPd, pastikanIdHibah, ser, tahunAktifAtauNull } from './umum';

const STATUS_FINAL: StatusUsulan[] = ['disetujui', 'ditolak'];

async function tahunAtauAktif(tahun?: number) {
  if (tahun) return tahun;
  const t = await tahunAktifAtauNull();
  if (!t) throw new Galat('VALIDASI', 'Belum ada tahun anggaran aktif');
  return t.tahun;
}

/* ---------- Dashboard, progres, rekap ---------- */

export async function dashboardHibah(user: SessionUser) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const t = await tahunAktifAtauNull();
  if (!t) return ser({ tahun: null });
  const c = cakupanDbHibah(user);
  const [jadwal, perStatus, peringatan, drive, berkas, progres] = await Promise.all([
    ambilJadwal(user, t.tahun),
    HibahUsulan.aggregate<{ _id: StatusUsulan; n: number; usulan: number; rekomendasi: number; disetujui: number }>([
      { $match: { tahun: t.tahun, ...c } },
      { $group: { _id: '$status', n: { $sum: 1 }, usulan: { $sum: '$nilaiUsulan' }, rekomendasi: { $sum: '$nilaiRekomendasi' }, disetujui: { $sum: { $ifNull: ['$nilaiDisetujui', 0] } } } },
    ]),
    HibahUsulan.countDocuments({ tahun: t.tahun, ...c, 'peringatan.0': { $exists: true }, status: { $in: ['evaluasi', 'rekomendasi_diunggah'] } }),
    bolehHibah(user, 'hibah_kelola_drive') ? HibahDrive.findOne({ kunci: 'utama' }, { email: 1, status: 1, kuota: 1 }).lean() : null,
    bolehHibah(user, 'hibah_kelola_drive') ? ringkasanBerkas() : null,
    peranHibah(user) === 'operator_pd' ? null : progresPd(user, t.tahun),
  ]);
  const evaluasi = jadwal.find((j) => j.tahapan === 'evaluasi');
  const mepet = !!evaluasi?.berjalan && evaluasi.sisaHari !== null && evaluasi.sisaHari <= 3;
  return ser({
    tahun: t.tahun,
    jadwal,
    perStatus,
    peringatan,
    drive,
    berkas,
    terkunci: t.kunciTahun?.terkunci ?? false,
    // FR-41: PD yang belum mengunggah rekomendasi saat tahapan Evaluasi PD tinggal 3 hari atau kurang
    pdBelumUnggah: mepet && progres ? progres.baris.filter((b) => b.belumUnggah > 0) : [],
    sisaHariEvaluasi: evaluasi?.berjalan ? evaluasi.sisaHari : null,
  });
}

export async function progresPd(user: SessionUser, tahun?: number) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const th = await tahunAtauAktif(tahun);
  const r = await HibahUsulan.aggregate<{ _id: { pd: unknown; status: StatusUsulan }; n: number }>([
    { $match: { tahun: th, ...cakupanDbHibah(user) } },
    { $group: { _id: { pd: '$skpdId', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const ids = [...new Set(r.map((x) => String(x._id.pd)))];
  const nama = await petaNamaPd(ids);
  const t = await HibahTahun.findOne({ tahun: th }).lean<HibahTahunDoc>();
  const baris = ids.map((id) => {
    const per = Object.fromEntries(r.filter((x) => String(x._id.pd) === id).map((x) => [x._id.status, x.n])) as Partial<Record<StatusUsulan, number>>;
    const total = Object.values(per).reduce((a, b) => a + (b ?? 0), 0);
    return {
      skpdId: id,
      namaPd: nama.get(id) ?? '',
      perStatus: per,
      total,
      belumUnggah: (per.draf ?? 0) + (per.evaluasi ?? 0) + (per.layak ?? 0) + (per.dalam_rekomendasi ?? 0),
      terkunci: !!t?.kunciTahun?.terkunci || !!t?.kunciPd.some((k) => String(k.skpdId) === id && k.terkunci),
    };
  });
  return ser({ tahun: th, baris: baris.sort((a, b) => a.namaPd.localeCompare(b.namaPd)) });
}

type Dimensi = 'pd' | 'jenis' | 'bentuk' | 'status';
export async function rekapHibah(user: SessionUser, tahun?: number, dimensi: Dimensi = 'pd') {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  await sambung();
  const th = await tahunAtauAktif(tahun);
  const kolom = { pd: '$skpdId', jenis: '$jenisPenerimaKode', bentuk: '$bentuk', status: '$status' }[dimensi];
  const r = await HibahUsulan.aggregate<{ _id: unknown; jumlah: number; nilaiUsulan: number; nilaiRekomendasi: number; nilaiDisetujui: number }>([
    { $match: { tahun: th, ...cakupanDbHibah(user) } },
    {
      $group: {
        _id: kolom, jumlah: { $sum: 1 }, nilaiUsulan: { $sum: '$nilaiUsulan' }, nilaiRekomendasi: { $sum: '$nilaiRekomendasi' },
        nilaiDisetujui: { $sum: { $ifNull: ['$nilaiDisetujui', 0] } },
      },
    },
  ]);
  let label: Map<string, string>;
  if (dimensi === 'pd') label = await petaNamaPd(r.map((x) => x._id));
  else if (dimensi === 'jenis') label = new Map((await HibahJenisPenerima.find({}, { kode: 1, nama: 1 }).lean()).map((j) => [j.kode, `${j.kode} ${j.nama}`]));
  else if (dimensi === 'status') label = new Map(Object.entries(LABEL_STATUS_USULAN));
  else label = new Map([['uang', 'Uang'], ['barang', 'Barang']]);
  return ser({
    tahun: th,
    dimensi,
    baris: r.map((x) => ({ ...x, kunci: String(x._id), label: label.get(String(x._id)) ?? String(x._id) })).sort((a, b) => a.label.localeCompare(b.label)),
  });
}

export async function eksporRekap(user: SessionUser, tahun?: number) {
  const th = await tahunAtauAktif(tahun);
  const kolom = [
    { header: 'Kelompok', key: 'label', width: 40 },
    { header: 'Jumlah Usulan', key: 'jumlah' },
    { header: 'Nilai Usulan', key: 'nilaiUsulan', rupiah: true, width: 18 },
    { header: 'Nilai Rekomendasi', key: 'nilaiRekomendasi', rupiah: true, width: 18 },
    { header: 'Nilai Disetujui', key: 'nilaiDisetujui', rupiah: true, width: 18 },
  ];
  const sheets = [];
  for (const [d, n] of [['pd', 'Per PD'], ['jenis', 'Per Jenis'], ['bentuk', 'Per Bentuk'], ['status', 'Per Status']] as const) {
    const r = await rekapHibah(user, th, d);
    sheets.push({ nama: n, judul: `Rekap Usulan Hibah dan Bansos TA ${th} · ${n}`, kolom: d === 'pd' ? [{ ...kolom[0], header: 'Perangkat Daerah' }, ...kolom.slice(1)] : kolom, baris: r.baris });
  }
  return { namaFile: `rekap-hibah-bansos-${th}.xlsx`, isi: await buatXlsx(sheets) };
}

/* ---------- Hasil terkunci: Berita Acara dan lampiran (FR-43–46, BR-12) ---------- */

async function pdTerkunci(tahun: number): Promise<{ semua: boolean; pd: Set<string> }> {
  const t = await HibahTahun.findOne({ tahun }).lean<HibahTahunDoc>();
  if (!t) throw tidakDitemukan('Tahun anggaran');
  return { semua: !!t.kunciTahun?.terkunci, pd: new Set(t.kunciPd.filter((k) => k.terkunci).map((k) => String(k.skpdId))) };
}

/** Satu sumber angka untuk BA, lampiran, dan rekap (AC-09): usulan berkeputusan final dalam cakupan. */
export async function agregatHasil(tahun: number, skpdIds?: string[]) {
  const filter: Record<string, unknown> = { tahun, status: { $in: STATUS_FINAL } };
  if (skpdIds?.length) filter.skpdId = { $in: skpdIds.map((s) => oid(s)) };
  const usulan = await HibahUsulan.find(filter, { rincian: 0, 'evaluasi.checklist': 0, riwayatStatus: 0 }).sort({ skpdId: 1, nomor: 1 }).lean<HibahUsulanDoc[]>();
  const rekap = (['hibah', 'bansos'] as const).map((k) => {
    const u = usulan.filter((x) => x.kelompok === k);
    return {
      kelompok: k === 'hibah' ? 'Hibah' : 'Bantuan Sosial',
      jumlah: u.length,
      nilaiUsulan: u.reduce((a, x) => a + x.nilaiUsulan, 0),
      nilaiRekomendasi: u.reduce((a, x) => a + x.nilaiRekomendasi, 0),
      nilaiDisetujui: u.reduce((a, x) => a + (x.nilaiDisetujui ?? 0), 0),
    };
  });
  const sidikKunci = createHash('sha256')
    .update(usulan.map((u) => `${u._id}:${u.status}:${u.nilaiDisetujui ?? 0}`).join('|'))
    .digest('hex');
  return { usulan, rekap, sidikKunci };
}

export async function daftarBeritaAcara(user: SessionUser, tahun?: number) {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  if (peranHibah(user) === 'operator_pd') throw new Galat('TIDAK_BERHAK', 'Anda tidak berhak melihat Berita Acara');
  await sambung();
  const th = await tahunAtauAktif(tahun);
  const kunci = await pdTerkunci(th);
  const [ba, perPd] = await Promise.all([
    HibahBeritaAcara.find({ tahun: th }).sort({ createdAt: -1 }).lean<HibahBeritaAcaraDoc[]>(),
    HibahUsulan.aggregate<{ _id: unknown; final: number; belum: number }>([
      { $match: { tahun: th } },
      { $group: { _id: '$skpdId', final: { $sum: { $cond: [{ $in: ['$status', STATUS_FINAL] }, 1, 0] } }, belum: { $sum: { $cond: [{ $in: ['$status', STATUS_FINAL] }, 0, 1] } } } },
    ]),
  ]);
  const nama = await petaNamaPd(perPd.map((p) => p._id));
  return ser({
    tahun: th,
    beritaAcara: ba,
    kunciTahun: kunci.semua,
    pd: perPd.map((p) => ({ skpdId: String(p._id), namaPd: nama.get(String(p._id)) ?? '', final: p.final, belum: p.belum, terkunci: kunci.semua || kunci.pd.has(String(p._id)) })),
    bolehCetak: bolehHibah(user, 'hibah_cetak_ba'),
  });
}

export async function buatBeritaAcara(user: SessionUser, input: z.infer<typeof S.beritaAcaraInput>) {
  pastikanBolehHibah(user, 'hibah_cetak_ba');
  await sambung();
  const kunci = await pdTerkunci(input.tahun);
  const skpdIds = input.skpdIds?.length ? input.skpdIds : undefined;
  // BR-12: hanya dari hasil yang terkunci
  if (!skpdIds && !kunci.semua) throw new Galat('VALIDASI', 'Kunci hasil seluruh tahun anggaran terlebih dahulu, atau pilih PD yang sudah terkunci');
  if (skpdIds && !kunci.semua && skpdIds.some((s) => !kunci.pd.has(s))) throw new Galat('VALIDASI', 'Semua PD yang dipilih harus sudah dikunci');
  const a = await agregatHasil(input.tahun, skpdIds);
  if (!a.usulan.length) throw new Galat('VALIDASI', 'Belum ada usulan yang disetujui atau ditolak dalam cakupan ini');
  const d = await HibahBeritaAcara.create({
    tahun: input.tahun, nomor: input.nomor, tanggal: input.tanggal, cakupan: { semua: !skpdIds, skpdIds: (skpdIds ?? []).map((s) => oid(s)) }, sidikKunci: a.sidikKunci,
  });
  return ser(d.toObject());
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Unduh BA atau lampirannya (.docx). Hasil yang berubah sejak BA dibuat membuat BA usang (BR-12). */
export async function unduhBeritaAcara(user: SessionUser, id: string, bagian: 'ba' | 'lampiran-1' | 'lampiran-2') {
  pastikanBolehHibah(user, 'hibah_lihat_rekap');
  if (peranHibah(user) === 'operator_pd') throw tidakDitemukan('Berita Acara');
  await sambung();
  const ba = await HibahBeritaAcara.findById(pastikanIdHibah(id, 'Berita Acara')).lean<HibahBeritaAcaraDoc>();
  if (!ba) throw tidakDitemukan('Berita Acara');
  const a = await agregatHasil(ba.tahun, ba.cakupan.semua ? undefined : ba.cakupan.skpdIds.map(String));
  if (ba.status === 'usang' || a.sidikKunci !== ba.sidikKunci) {
    if (ba.status !== 'usang') await HibahBeritaAcara.updateOne({ _id: ba._id }, { $set: { status: 'usang' } });
    throw new Galat('VALIDASI', 'Hasil verifikasi berubah sejak Berita Acara ini dibuat. Buat Berita Acara baru.');
  }
  const t = await HibahTahun.findOne({ tahun: ba.tahun }).lean<HibahTahunDoc>();
  if (bagian === 'ba') {
    const tapd = await HibahSusunan.find({ tahun: ba.tahun }).sort({ urutan: 1 }).lean();
    const total = a.rekap.reduce((x, r) => x + r.nilaiDisetujui, 0);
    const tgl = new Date(ba.tanggal);
    const data = {
      nomor: ba.nomor, tanggal: tanggalPanjang(tgl), hariTanggal: `${HARI[new Date(tgl.getTime() + 7 * 3600_000).getUTCDay()]}, ${tanggalPanjang(tgl)}`, tahun: ba.tahun, alamatKop: '',
      dasarHukum: (t?.dasarHukum ?? []).map((teks, i) => ({ no: i + 1, teks })),
      rekap: a.rekap.map((r) => ({ ...r, nilaiUsulan: rpTeks(r.nilaiUsulan), nilaiRekomendasi: rpTeks(r.nilaiRekomendasi), nilaiDisetujui: rpTeks(r.nilaiDisetujui) })),
      tapd: tapd.map((x, i) => ({ no: i + 1, nama: x.nama, nip: x.nip, jabatan: x.jabatanTapd })),
      totalDisetujui: rpTeks(total), totalDisetujuiTerbilang: terbilang(total),
    };
    const tp = await ambilTemplat('berita_acara');
    return { namaFile: `berita-acara-${ba.tahun}-${ba.nomor.replace(/[^\w.-]+/g, '-')}.docx`, isi: isiTemplat(tp.isi, data) };
  }
  const kelompok = bagian === 'lampiran-1' ? 'hibah' : 'bansos';
  const u = a.usulan.filter((x) => x.kelompok === kelompok);
  const [nama, penerima, jenis] = await Promise.all([
    petaNamaPd(u.map((x) => x.skpdId)),
    HibahPenerima.find({ _id: { $in: u.map((x) => x.penerimaId) } }, { nama: 1, alamat: 1, desaKode: 1, kecamatanKode: 1 }).lean(),
    HibahJenisPenerima.find({}, { kode: 1, nama: 1 }).lean(),
  ]);
  const alamat = await petaAlamat(penerima);
  const p = new Map(penerima.map((x) => [String(x._id), x]));
  const nj = new Map(jenis.map((j) => [j.kode, j.nama]));
  const mtm = (v: boolean | null | undefined) => (v === true ? 'M' : v === false ? 'TM' : '');
  const data = {
    judul: bagian === 'lampiran-1' ? 'LAMPIRAN I · HASIL VERIFIKASI TAPD ATAS CALON PENERIMA HIBAH' : 'LAMPIRAN II · HASIL VERIFIKASI TAPD ATAS CALON PENERIMA BANTUAN SOSIAL',
    tahun: ba.tahun,
    nomorBa: ba.nomor,
    baris: u.map((x, i) => {
      const asp = KODE_ASPEK.map((k) => x.verifikasi?.aspek?.find((s) => s.kode === k)?.memenuhi);
      return {
        no: i + 1, pd: nama.get(String(x.skpdId)) ?? '', nama: p.get(String(x.penerimaId))?.nama ?? '', alamat: alamat(p.get(String(x.penerimaId))),
        jenis: nj.get(x.jenisPenerimaKode) ?? x.jenisPenerimaKode, bentuk: x.bentuk === 'uang' ? 'Uang' : 'Barang',
        aspek1: mtm(asp[0]), aspek2: mtm(asp[1]), aspek3: mtm(asp[2]), aspek4: mtm(asp[3]),
        status: LABEL_STATUS_USULAN[x.status], nilaiRekomendasi: rpTeks(x.nilaiRekomendasi), nilaiDisetujui: rpTeks(x.nilaiDisetujui ?? 0), alasan: x.verifikasi?.alasan ?? '',
      };
    }),
    totalRekomendasi: rpTeks(u.reduce((s, x) => s + x.nilaiRekomendasi, 0)),
    totalDisetujui: rpTeks(u.reduce((s, x) => s + (x.nilaiDisetujui ?? 0), 0)),
  };
  const tp = await ambilTemplat('lampiran');
  return { namaFile: `${bagian}-berita-acara-${ba.tahun}.docx`, isi: isiTemplat(tp.isi, data) };
}

async function petaAlamat(penerima: { alamat?: string; desaKode?: string; kecamatanKode?: string }[]) {
  const [desa, kec] = await Promise.all([
    WilayahDesa.find({ kode: { $in: penerima.map((p) => p.desaKode).filter(Boolean) } }, { kode: 1, nama: 1 }).lean(),
    WilayahKecamatan.find({ kode: { $in: penerima.map((p) => p.kecamatanKode).filter(Boolean) } }, { kode: 1, nama: 1 }).lean(),
  ]);
  const nd = new Map(desa.map((x) => [x.kode, x.nama]));
  const nk = new Map(kec.map((x) => [x.kode, x.nama]));
  return (x?: { alamat?: string; desaKode?: string; kecamatanKode?: string }) =>
    x ? [x.alamat, x.desaKode && `Desa/Kel. ${nd.get(x.desaKode) ?? ''}`, x.kecamatanKode && `Kec. ${nk.get(x.kecamatanKode) ?? ''}`].filter(Boolean).join(', ') : '';
}

export async function unggahBeritaAcara(user: SessionUser, id: string, berkas: { nama: string; isi: Buffer }) {
  pastikanBolehHibah(user, 'hibah_cetak_ba');
  await sambung();
  const ba = await HibahBeritaAcara.findById(pastikanIdHibah(id, 'Berita Acara')).lean<HibahBeritaAcaraDoc>();
  if (!ba) throw tidakDitemukan('Berita Acara');
  if (ba.status === 'usang') throw new Galat('VALIDASI', 'Berita Acara ini sudah usang; buat Berita Acara baru');
  const b = await terimaBerkas(user, { pemilikJenis: 'berita_acara', pemilikId: String(ba._id), jenisDokumen: 'berita_acara_ttd', nama: berkas.nama, isi: berkas.isi });
  await HibahBeritaAcara.findOneAndUpdate({ _id: ba._id }, { $set: { status: 'diunggah', berkasId: oid((b as { _id: unknown })._id) } });
  return ser(await HibahBeritaAcara.findById(ba._id).lean());
}

/** FR-45: daftar penerima disetujui format Lampiran 3a/3b (hibah) dan 4a/4b (bansos) Perkada; a = uang, b = barang. */
export async function eksporLampiranPerkada(user: SessionUser, tahun: number, jenis: '3a' | '3b' | '4a' | '4b') {
  pastikanBolehHibah(user, 'hibah_cetak_ba');
  await sambung();
  const kunci = await pdTerkunci(tahun);
  const kelompok = jenis.startsWith('3') ? 'hibah' : 'bansos';
  const bentuk = jenis.endsWith('a') ? 'uang' : 'barang';
  const u = (await agregatHasil(tahun)).usulan.filter(
    (x) => x.status === 'disetujui' && x.kelompok === kelompok && x.bentuk === bentuk && (kunci.semua || kunci.pd.has(String(x.skpdId))),
  );
  const penerima = await HibahPenerima.find({ _id: { $in: u.map((x) => x.penerimaId) } }, { nama: 1, alamat: 1, desaKode: 1, kecamatanKode: 1 }).lean();
  const alamat = await petaAlamat(penerima);
  const p = new Map(penerima.map((x) => [String(x._id), x]));
  const judul = `Lampiran ${jenis.toUpperCase()} · Daftar Penerima ${kelompok === 'hibah' ? 'Hibah' : 'Bantuan Sosial'} Berupa ${bentuk === 'uang' ? 'Uang' : 'Barang'} TA ${tahun}`;
  const isi = await buatXlsx([
    {
      nama: `Lampiran ${jenis.toUpperCase()}`,
      judul,
      kolom: [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Nama Penerima', key: 'nama', width: 40 },
        { header: 'Alamat', key: 'alamat', width: 50 },
        { header: 'Besaran (Rp)', key: 'besaran', rupiah: true, width: 18 },
      ],
      baris: u.map((x, i) => ({ no: i + 1, nama: p.get(String(x.penerimaId))?.nama ?? '', alamat: alamat(p.get(String(x.penerimaId))), besaran: x.nilaiDisetujui ?? 0 })),
    },
  ]);
  return { namaFile: `lampiran-${jenis}-perkada-${tahun}.xlsx`, isi };
}

/* ---------- Audit, pencarian ---------- */

export async function daftarAuditHibah(user: SessionUser, f: { page?: number; koleksi?: string } = {}) {
  pastikanBolehHibah(user, 'hibah_lihat_audit');
  await sambung();
  const filter = { koleksi: f.koleksi && /^(hibah_|wilayah_)[a-z_]+$/.test(f.koleksi) ? f.koleksi : { $regex: '^(hibah_|wilayah_)' } };
  const page = f.page ?? 1;
  const [data, total] = await Promise.all([
    LogAudit.find(filter).sort({ waktu: -1 }).skip((page - 1) * 50).limit(50).populate('userId', 'nama username').lean(),
    LogAudit.countDocuments(filter),
  ]);
  return ser({ data, total, page, limit: 50 });
}

/** Ctrl+K di modul Hibah dan Bansos: penerima, nomor usulan, nomor rekomendasi, dalam cakupan pengguna. */
export async function cariHibah(user: SessionUser, q: string) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const s = q.trim();
  if (s.length < 2) return [];
  const c = cakupanDbHibah(user);
  const rx = { $regex: escapeRegex(s), $options: 'i' };
  const p = await HibahPenerima.find({ namaNormal: { $regex: escapeRegex(normalisasiNama(s)), $options: 'i' } }, { nama: 1, 'identitas.samaran': 1 }).limit(20).lean();
  const [usulan, rek] = await Promise.all([
    HibahUsulan.find({ ...c, $or: [{ nomor: rx }, { penerimaId: { $in: p.map((x) => x._id) } }] }, { nomor: 1, penerimaId: 1, status: 1 }).limit(8).lean(),
    HibahRekomendasi.find({ ...c, nomor: rx, status: { $ne: 'batal' } }, { nomor: 1, status: 1 }).limit(4).lean(),
  ]);
  const nama = new Map(p.map((x) => [String(x._id), x.nama]));
  const tambahan = await HibahPenerima.find({ _id: { $in: usulan.map((u) => u.penerimaId).filter((i) => !nama.has(String(i))) } }, { nama: 1 }).lean();
  for (const t of tambahan) nama.set(String(t._id), t.nama);
  return ser([
    ...usulan.map((u) => ({ jenis: 'usulan', id: u._id, judul: nama.get(String(u.penerimaId)) ?? u.nomor, sub: `${u.nomor} · ${LABEL_STATUS_USULAN[u.status as StatusUsulan]}` })),
    ...rek.map((r) => ({ jenis: 'rekomendasi', id: r._id, judul: `Rekomendasi ${r.nomor}`, sub: r.status === 'diunggah' ? 'Sudah diunggah' : 'Draf' })),
  ]);
}

export async function tahunUntukPengguna() {
  await sambung();
  return ser(await HibahTahun.find({}, { tahun: 1, aktif: 1 }).sort({ tahun: -1 }).lean());
}

export const skpdSemua = async () => {
  await sambung();
  return ser(await Skpd.find({ aktif: true }, { nama: 1, kode: 1 }).sort({ nama: 1 }).lean());
};
