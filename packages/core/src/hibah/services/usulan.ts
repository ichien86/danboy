import type { ClientSession } from 'mongoose';
import {
  dalamTransaksi, HibahBerkas, HibahBerkasWajib, HibahChecklist, HibahJenisPenerima, HibahPenerima, HibahRekening, HibahRekomendasi,
  HibahTujuanBansos, HibahUsulan, Nomenklatur, oid, sambung, SubkegiatanTahapan, Tahapan,
  type ButirEvaluasi, type HibahJenisPenerimaDoc, type HibahPenerimaDoc, type HibahUsulanDoc, type PeringatanUsulan,
} from '@danboy/db';
import type { z } from '@danboy/schema';
import type * as S from '@danboy/schema';
import { Galat, tidakDitemukan } from '../../galat';
import { bolehHibah, pastikanBolehHibah, peranHibah, type SessionUser } from '../../akses';
import { escapeRegex } from '../../services/umum';
import {
  bisaDiubahPd, cekNilaiRekomendasi, dalamJadwal, formatNomorUsulan, hitungJumlah, hitungNilai, KODE_ASPEK, LABEL_STATUS_USULAN,
  normalisasiNama, tahapanAksiPd, transisi, validasiVerifikasi, type AksiStatus, type StatusUsulan,
} from '../aturan';
import { cocokkanRiwayat } from './penerima';
import {
  cakupanDbHibah, cekJadwal, galatBerubah, muatJadwal, petaNamaPd, nomorBerikut, pastikanIdHibah, pastikanTidakTerkunci, ser, syaratVersi,
  tahunAktif, terkunci,
} from './umum';

type Usulan = HibahUsulanDoc;

/** Usulan dalam cakupan pengguna; di luar cakupan = tidak ada (404). */
export async function muatUsulan(user: SessionUser, id: string, session?: ClientSession | null): Promise<Usulan> {
  const u = await HibahUsulan.findOne({ _id: oid(pastikanIdHibah(id, 'Usulan')), ...cakupanDbHibah(user) })
    .session(session ?? null)
    .lean<Usulan>();
  if (!u) throw tidakDitemukan('Usulan');
  return u;
}

/**
 * Jadwal aksi PD pada usulan (BR-11). Usulan yang pernah berstatus Perbaikan (termasuk yang dievaluasi ulang
 * dan masuk rekomendasi baru) diproses dalam jadwal Perbaikan, selain jadwal tahapan menurut statusnya.
 */
export async function cekJadwalPd(u: Pick<Usulan, 'tahun' | 'status' | 'skpdId' | 'riwayatStatus'>) {
  const pd = String(u.skpdId);
  const pernahPerbaikan = u.riwayatStatus?.some((r) => r.status === 'perbaikan');
  if (pernahPerbaikan && dalamJadwal(await muatJadwal(u.tahun, 'perbaikan'), pd)) return;
  await cekJadwal(u.tahun, tahapanAksiPd(u.status), pd);
}

const catatStatus = (status: StatusUsulan, user: SessionUser, catatan = '') => ({ status, waktu: new Date(), userId: oid(user.id), catatan });

/** Simpan dengan syarat versi; perubahan status selalu dicatat di riwayatStatus (FR-42). */
async function simpan(user: SessionUser, u: Usulan, updatedAt: string | Date, set: Record<string, unknown>, aksi?: AksiStatus, catatan = '', session?: ClientSession) {
  const upd: Record<string, unknown> = { $set: { ...set } };
  if (aksi) {
    const ke = transisi(u.status, aksi);
    (upd.$set as Record<string, unknown>).status = ke;
    upd.$push = { riwayatStatus: catatStatus(ke, user, catatan) };
  }
  const d = await HibahUsulan.findOneAndUpdate({ _id: u._id, updatedAt: updatedAt instanceof Date ? updatedAt : syaratVersi(updatedAt) }, upd, {
    new: true,
    session,
  }).lean<Usulan>();
  if (!d) throw galatBerubah();
  return d;
}

async function jenisDari(kode: string) {
  const j = await HibahJenisPenerima.findOne({ kode }).lean<HibahJenisPenerimaDoc>();
  if (!j) throw new Galat('VALIDASI', 'Jenis penerima tidak dikenal');
  return j;
}

/** Subkegiatan PD dari data APBD tahapan terbaru milik PD itu; bila belum ada, dari master nomenklatur (FR-02). */
export async function subkegiatanPd(user: SessionUser, f: { skpdId?: string; q?: string } = {}) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const skpdId = peranHibah(user) === 'operator_pd' ? user.skpdId : f.skpdId;
  const cari = f.q?.trim() ? { $regex: escapeRegex(f.q.trim()), $options: 'i' } : null;
  if (skpdId) {
    const tahapan = await SubkegiatanTahapan.distinct('tahapanId', { skpdId: oid(skpdId) });
    const terbaru = await Tahapan.findOne({ _id: { $in: tahapan } }).sort({ tahun: -1, urutan: -1, createdAt: -1 }).lean();
    if (terbaru) {
      const d = await SubkegiatanTahapan.aggregate<{ _id: string; nama: string }>([
        { $match: { tahapanId: terbaru._id, skpdId: oid(skpdId), ...(cari ? { $or: [{ kodeSubkegiatan: cari }, { namaSubkegiatan: cari }] } : {}) } },
        { $group: { _id: '$kodeSubkegiatan', nama: { $first: '$namaSubkegiatan' } } },
        { $sort: { _id: 1 } },
        { $limit: 300 },
      ]);
      return { sumber: `APBD ${terbaru.nama}`, data: d.map((x) => ({ kode: x._id, nama: x.nama })) };
    }
  }
  const n = await Nomenklatur.find({ jenis: 'subkegiatan', aktif: true, ...(cari ? { $or: [{ kode: cari }, { nama: cari }] } : {}) }, { kode: 1, nama: 1 })
    .sort({ kode: 1 })
    .limit(100)
    .lean();
  return { sumber: 'Master nomenklatur', data: n.map((x) => ({ kode: x.kode, nama: x.nama })) };
}

async function namaSubkegiatan(kode: string) {
  if (!kode) return '';
  const s = await SubkegiatanTahapan.findOne({ kodeSubkegiatan: kode }, { namaSubkegiatan: 1 }).sort({ createdAt: -1 }).lean();
  if (s) return s.namaSubkegiatan;
  return (await Nomenklatur.findOne({ kode, jenis: 'subkegiatan' }, { nama: 1 }).lean())?.nama ?? '';
}

function bentukRincian(rincian: z.infer<typeof S.rincianInput>[], lama: Usulan['rincian'] = []) {
  return rincian.map((r) => {
    const sebelum = r._id ? lama.find((x) => String(x._id) === r._id) : undefined;
    const jumlah = hitungJumlah(r);
    // nilai rekomendasi lama dipertahankan selama tidak melebihi jumlah yang baru (BR-02)
    const rek = sebelum?.nilaiRekomendasi ?? null;
    return {
      ...(r._id ? { _id: oid(r._id) } : {}),
      uraian: r.uraian, spesifikasi: r.spesifikasi, volume: Math.round(r.volume * 100) / 100, satuan: r.satuan, hargaSatuan: r.hargaSatuan, jumlah,
      nilaiRekomendasi: rek !== null && rek <= jumlah ? rek : null,
      catatanRekomendasi: sebelum?.catatanRekomendasi ?? '',
    };
  });
}

async function validasiDataUsulan(j: HibahJenisPenerimaDoc, d: { bentuk?: string; tujuanBansosKode?: string; kodeRekening?: string }) {
  const g: Record<string, string> = {};
  // BR-05: bentuk harus diizinkan jenis penerima (BUMD hanya uang)
  if (d.bentuk && !j.bentuk.includes(d.bentuk as 'uang' | 'barang')) g.bentuk = `Jenis ${j.nama} tidak boleh berbentuk ${d.bentuk}`;
  if (d.tujuanBansosKode && !(await HibahTujuanBansos.exists({ kode: d.tujuanBansosKode, aktif: true }))) g.tujuanBansosKode = 'Tujuan bansos tidak dikenal';
  if (d.kodeRekening) {
    const r = await HibahRekening.findOne({ kodeRekening: d.kodeRekening, aktif: true }).lean();
    if (!r) g.kodeRekening = 'Rekening tidak terdaftar di master rekening hibah/bansos';
    else if (r.jenisPenerimaKode.length && !r.jenisPenerimaKode.includes(j.kode)) g.kodeRekening = 'Rekening ini tidak dipetakan untuk jenis penerima tersebut';
  }
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
}

export async function buatUsulan(user: SessionUser, input: z.infer<typeof S.usulanInput>) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const t = await tahunAktif();
  await cekJadwal(t.tahun, 'input', user.skpdId);
  const p = await HibahPenerima.findById(pastikanIdHibah(input.penerimaId, 'Penerima')).lean<HibahPenerimaDoc>();
  if (!p) throw tidakDitemukan('Penerima');
  const j = await jenisDari(p.jenisPenerimaKode);
  await validasiDataUsulan(j, input);
  const rincian = bentukRincian(input.rincian);
  const n = hitungNilai(rincian);
  const d = await dalamTransaksi(async (session) => {
    const urut = await nomorBerikut(`usulan-${t.tahun}`, session);
    const [u] = await HibahUsulan.create(
      [
        {
          tahun: t.tahun,
          nomor: formatNomorUsulan(t.tahun, urut),
          skpdId: oid(user.skpdId),
          penerimaId: p._id,
          jenisPenerimaKode: j.kode,
          kelompok: j.kelompok,
          bentuk: input.bentuk,
          subkegiatanKode: input.subkegiatanKode,
          subkegiatanNama: await namaSubkegiatan(input.subkegiatanKode),
          kodeRekening: input.kodeRekening,
          peruntukan: j.kelompok === 'hibah' ? input.peruntukan : '',
          tujuanBansosKode: j.kelompok === 'bansos' ? input.tujuanBansosKode : '',
          proposal: { nomor: input.proposalNomor, tanggal: input.proposalTanggal ?? null },
          rincian,
          nilaiUsulan: n.nilaiUsulan,
          nilaiRekomendasi: n.nilaiRekomendasi,
          verifikasi: { aspek: KODE_ASPEK.map((kode) => ({ kode, memenuhi: null, catatan: '' })) },
          status: 'draf',
          riwayatStatus: [catatStatus('draf', user)],
        },
      ],
      { session },
    );
    return u;
  });
  return ser(d.toObject());
}

function pastikanPdPemilik(user: SessionUser, u: Usulan) {
  if (peranHibah(user) !== 'operator_pd' || String(u.skpdId) !== user.skpdId) throw new Galat('TIDAK_BERHAK', 'Hanya Operator PD pemilik usulan yang dapat mengubahnya');
  if (!bisaDiubahPd(u.status))
    throw new Galat('VALIDASI', `Usulan berstatus ${LABEL_STATUS_USULAN[u.status]} tidak bisa diubah PD (BR-09)`, { status: u.status });
}

export async function ubahUsulan(user: SessionUser, id: string, input: z.infer<typeof S.usulanUbah>) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const u = await muatUsulan(user, id);
  pastikanPdPemilik(user, u);
  await cekJadwalPd(u);
  const j = await jenisDari(u.jenisPenerimaKode);
  await validasiDataUsulan(j, input);
  const set: Record<string, unknown> = {};
  if (input.bentuk) set.bentuk = input.bentuk;
  if (input.subkegiatanKode !== undefined) {
    set.subkegiatanKode = input.subkegiatanKode;
    set.subkegiatanNama = await namaSubkegiatan(input.subkegiatanKode);
  }
  if (input.kodeRekening !== undefined) set.kodeRekening = input.kodeRekening;
  if (input.peruntukan !== undefined && j.kelompok === 'hibah') set.peruntukan = input.peruntukan;
  if (input.tujuanBansosKode !== undefined && j.kelompok === 'bansos') set.tujuanBansosKode = input.tujuanBansosKode;
  if (input.proposalNomor !== undefined) set['proposal.nomor'] = input.proposalNomor;
  if (input.proposalTanggal !== undefined) set['proposal.tanggal'] = input.proposalTanggal;
  if (input.rincian) {
    const rincian = bentukRincian(input.rincian, u.rincian);
    const n = hitungNilai(rincian);
    Object.assign(set, { rincian, nilaiUsulan: n.nilaiUsulan, nilaiRekomendasi: n.nilaiRekomendasi });
  }
  // isi usulan yang sudah disimpulkan berubah: kesimpulan harus ditinjau ulang
  const aksi: AksiStatus | undefined = u.status === 'layak' || u.status === 'tidak_layak' ? 'ubah_kesimpulan' : undefined;
  if (aksi) set['evaluasi.kesimpulan'] = null;
  return ser(await simpan(user, u, input.updatedAt, set, aksi, aksi ? 'Isi usulan diubah setelah kesimpulan' : ''));
}

export async function hapusUsulan(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const u = await muatUsulan(user, id);
  pastikanPdPemilik(user, u);
  if (u.status !== 'draf') throw new Galat('VALIDASI', 'Hanya usulan berstatus Draf yang bisa dihapus');
  await HibahUsulan.deleteOne({ _id: u._id });
  await HibahBerkas.updateMany({ 'pemilik.jenis': 'usulan', 'pemilik.id': u._id }, { $set: { aktif: false } });
  return { ok: true };
}

/** Berkas wajib beserta status kelengkapannya (FR-17). */
export async function statusBerkasWajib(u: Pick<Usulan, '_id' | 'jenisPenerimaKode' | 'penerimaId'>) {
  const [wajib, berkas] = await Promise.all([
    HibahBerkasWajib.find({ jenisPenerimaKode: { $in: [u.jenisPenerimaKode, '*'] }, aktif: true }).sort({ tingkat: 1, kode: 1 }).lean(),
    HibahBerkas.find(
      { aktif: true, status: { $in: ['menunggu', 'tersimpan'] }, $or: [{ 'pemilik.jenis': 'usulan', 'pemilik.id': u._id }, { 'pemilik.jenis': 'penerima', 'pemilik.id': u.penerimaId }] },
      { jenisDokumen: 1, 'pemilik.jenis': 1 },
    ).lean(),
  ]);
  return wajib.map((w) => ({
    kode: w.kode,
    nama: w.nama,
    tingkat: w.tingkat,
    wajib: w.wajib,
    sensitif: w.sensitif,
    ada: berkas.some((b) => b.jenisDokumen === w.kode && b.pemilik.jenis === w.tingkat),
  }));
}

/** Butir checklist untuk jenis penerima: butir umum kelompok (hibah/bansos) lalu butir khusus jenis. */
async function snapshotChecklist(j: HibahJenisPenerimaDoc): Promise<ButirEvaluasi[]> {
  const b = await HibahChecklist.find({ jenisPenerimaKode: { $in: [j.kelompok, j.kode] }, aktif: true }).lean();
  b.sort((x, y) => Number(x.jenisPenerimaKode !== j.kelompok) - Number(y.jenisPenerimaKode !== j.kelompok) || x.urutan - y.urutan);
  return b.map((x) => ({ butirId: x._id, versi: x.versi, pertanyaan: x.pertanyaan, dasar: x.dasar, wajib: x.wajib, jawaban: null, catatan: '', berkasIds: [] }));
}

/** Peringatan otomatis (FR-23, BR-06); catatan operator yang sudah ada dipertahankan bila kodenya sama. */
export async function hitungPeringatan(u: Usulan, session?: ClientSession | null): Promise<PeringatanUsulan[]> {
  const [p, j] = await Promise.all([HibahPenerima.findById(u.penerimaId).session(session ?? null).lean<HibahPenerimaDoc>(), jenisDari(u.jenisPenerimaKode)]);
  const lain = await HibahUsulan.find({ penerimaId: u.penerimaId, _id: { $ne: u._id } }, { tahun: 1, skpdId: 1, status: 1, nomor: 1 }).session(session ?? null).lean();
  const nama = await petaNamaPd(lain.map((x) => x.skpdId));
  const hasil: PeringatanUsulan[] = [];
  if (!j.bebasTerusMenerus && p) {
    const riwayat = await cocokkanRiwayat(p, u.tahun);
    const disetujui = lain.filter((x) => x.tahun < u.tahun && x.status === 'disetujui');
    const sumber = [
      ...riwayat.map((r) => ({ jenis: 'riwayat' as const, id: r._id, tahun: r.tahun, label: `${r.nama} · ${r.namaPd} · TA ${r.tahun}${r.tingkat === 'kemungkinan' ? ' (kemungkinan sama)' : ''}` })),
      ...disetujui.map((x) => ({ jenis: 'usulan' as const, id: x._id, tahun: x.tahun, label: `${x.nomor} · ${nama.get(String(x.skpdId)) ?? ''} · TA ${x.tahun}` })),
    ];
    if (sumber.length)
      hasil.push({
        kode: 'RIWAYAT',
        pesan:
          j.kelompok === 'bansos'
            ? 'Penerima pernah menerima pada tahun sebelumnya. Bansos boleh berkelanjutan hanya dalam keadaan tertentu; jelaskan dasarnya.'
            : 'Penerima pernah menerima pada tahun sebelumnya; hibah tidak boleh diberikan terus-menerus setiap tahun.',
        sumber,
        catatanOperator: '',
      });
  }
  const tahunIni = lain.filter((x) => x.tahun === u.tahun && x.status !== 'ditolak');
  const samaPd = tahunIni.filter((x) => String(x.skpdId) === String(u.skpdId));
  const pdLain = tahunIni.filter((x) => String(x.skpdId) !== String(u.skpdId));
  const label = (x: (typeof lain)[number]) => ({ jenis: 'usulan' as const, id: x._id, tahun: x.tahun, label: `${x.nomor} · ${nama.get(String(x.skpdId)) ?? ''}` });
  if (samaPd.length) hasil.push({ kode: 'USULAN_LAIN', pesan: 'Penerima punya usulan lain pada tahun yang sama di PD ini.', sumber: samaPd.map(label), catatanOperator: '' });
  if (pdLain.length) hasil.push({ kode: 'DOBEL', pesan: 'Penerima juga diusulkan PD lain pada tahun yang sama; periksa duplikasi anggaran.', sumber: pdLain.map(label), catatanOperator: '' });
  if (j.sekaliSetahun && tahunIni.length)
    hasil.push({ kode: 'KL_SETAHUN', pesan: 'Satuan kerja K/L hanya boleh menerima hibah 1 kali dalam tahun berkenaan.', sumber: tahunIni.map(label), catatanOperator: '' });
  return hasil.map((h) => ({ ...h, catatanOperator: u.peringatan?.find((x) => x.kode === h.kode)?.catatanOperator ?? '' }));
}

/** Syarat kirim ke evaluasi (BR-13) dan kelengkapan data usulan. */
async function pastikanSiapEvaluasi(u: Usulan, j: HibahJenisPenerimaDoc) {
  const g: Record<string, string> = {};
  if (!u.rincian.length) g.rincian = 'Minimal satu rincian aktivitas';
  if (!u.subkegiatanKode) g.subkegiatanKode = 'Subkegiatan wajib dipilih';
  if (!u.kodeRekening) g.kodeRekening = 'Rekening wajib dipilih';
  if (!u.proposal?.nomor) g.proposalNomor = 'Nomor proposal wajib diisi';
  if (j.kelompok === 'hibah' && !u.peruntukan) g.peruntukan = 'Peruntukan hibah wajib diisi';
  if (j.kelompok === 'bansos' && !u.tujuanBansosKode) g.tujuanBansosKode = 'Tujuan bansos wajib dipilih';
  const kurang = (await statusBerkasWajib(u)).filter((b) => b.wajib && !b.ada);
  if (kurang.length) g.berkas = `Berkas wajib belum lengkap: ${kurang.map((b) => b.nama).join(', ')}`;
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
}

/**
 * Kirim: Draf → Evaluasi PD; Perbaikan → kembali ke TAPD bila nilai rekomendasi tidak berubah (BR-07),
 * selain itu usulan harus dievaluasi ulang dan masuk dokumen rekomendasi baru (AC-07).
 */
export async function kirimUsulan(user: SessionUser, id: string, input: z.infer<typeof S.kirimUsulanInput>) {
  pastikanBolehHibah(user, 'hibah_input_usulan');
  await sambung();
  const u = await muatUsulan(user, id);
  pastikanPdPemilik(user, u);
  const j = await jenisDari(u.jenisPenerimaKode);
  await cekJadwalPd(u);
  if (u.status === 'draf') {
    await pastikanSiapEvaluasi(u, j);
    const checklist = u.evaluasi?.checklist?.length ? u.evaluasi.checklist : await snapshotChecklist(j);
    const peringatan = await hitungPeringatan(u);
    return ser(await simpan(user, u, input.updatedAt, { 'evaluasi.checklist': checklist, peringatan }, 'kirim'));
  }
  if (u.status === 'perbaikan') {
    if (u.nilaiRekomendasi !== u.nilaiRekomendasiTerakhirDisahkan)
      throw new Galat('VALIDASI', 'Nilai rekomendasi berubah: usulan harus dievaluasi ulang dan masuk dokumen rekomendasi baru (BR-07)');
    await pastikanSiapEvaluasi(u, j);
    return ser(await simpan(user, u, input.updatedAt, { 'verifikasi.keputusan': null }, 'kirim_ulang', 'Perbaikan dikirim ulang ke TAPD'));
  }
  throw new Galat('VALIDASI', `Usulan berstatus ${LABEL_STATUS_USULAN[u.status]} tidak bisa dikirim`);
}

export async function simpanEvaluasi(user: SessionUser, id: string, input: z.infer<typeof S.evaluasiInput>) {
  pastikanBolehHibah(user, 'hibah_evaluasi');
  await sambung();
  const u = await muatUsulan(user, id);
  pastikanPdPemilik(user, u);
  if (u.status !== 'evaluasi' && u.status !== 'perbaikan') throw new Galat('VALIDASI', 'Evaluasi hanya bisa diisi pada status Evaluasi PD atau Perbaikan');
  await cekJadwalPd(u);
  const checklist = u.evaluasi.checklist.map((b) => {
    const m = input.checklist.find((x) => x.butirId === String(b.butirId));
    return m ? { ...b, jawaban: m.jawaban, catatan: m.catatan } : b;
  });
  const rincian = u.rincian.map((r) => {
    const m = input.rincian.find((x) => x._id === String(r._id));
    return m ? { ...r, nilaiRekomendasi: m.nilaiRekomendasi, catatanRekomendasi: m.catatanRekomendasi } : r;
  });
  const g = cekNilaiRekomendasi(rincian);
  if (Object.keys(g).length) throw new Galat('VALIDASI', Object.values(g)[0], g);
  const nilaiRekomendasi = hitungNilai(rincian).nilaiRekomendasi;
  const peringatan = (u.peringatan ?? []).map((p) => ({ ...p, catatanOperator: input.peringatan.find((x) => x.kode === p.kode)?.catatanOperator ?? p.catatanOperator }));
  const set: Record<string, unknown> = { 'evaluasi.checklist': checklist, 'evaluasi.catatan': input.catatan, rincian, nilaiRekomendasi, peringatan };
  // Perbaikan yang mengubah nilai rekomendasi kembali ke evaluasi PD dan rekomendasi baru (BR-07)
  const ulang = u.status === 'perbaikan' && nilaiRekomendasi !== u.nilaiRekomendasiTerakhirDisahkan;
  if (ulang) Object.assign(set, { rekomendasiId: null, 'evaluasi.kesimpulan': null });
  return ser(await simpan(user, u, input.updatedAt, set, ulang ? 'evaluasi_ulang' : undefined, ulang ? 'Nilai rekomendasi diubah saat perbaikan' : ''));
}

export async function tetapkanKesimpulan(user: SessionUser, id: string, input: z.infer<typeof S.kesimpulanInput>) {
  pastikanBolehHibah(user, 'hibah_evaluasi');
  await sambung();
  const u = await muatUsulan(user, id);
  pastikanPdPemilik(user, u);
  await cekJadwalPd(u);
  if (input.kesimpulan === null) {
    return ser(await simpan(user, u, input.updatedAt, { 'evaluasi.kesimpulan': null }, 'ubah_kesimpulan', 'Kesimpulan dibuka kembali'));
  }
  // peringatan dihitung ulang: data riwayat atau usulan lain bisa bertambah sejak dikirim
  const peringatan = await hitungPeringatan(u);
  const g: Record<string, string> = {};
  const belum = u.evaluasi.checklist.filter((b) => b.wajib && !b.jawaban);
  if (belum.length) g.checklist = `${belum.length} butir checklist wajib belum dijawab`;
  if (peringatan.some((p) => !p.catatanOperator.trim())) g.peringatan = 'Setiap peringatan wajib diberi catatan sebelum evaluasi diselesaikan';
  if (input.kesimpulan === 'layak' && u.rincian.some((r) => r.nilaiRekomendasi === null)) g.rincian = 'Nilai rekomendasi setiap rincian wajib diisi';
  if (Object.keys(g).length) {
    await HibahUsulan.updateOne({ _id: u._id }, { $set: { peringatan } });
    throw new Galat('VALIDASI', Object.values(g)[0], g);
  }
  const aksi: AksiStatus = input.kesimpulan === 'layak' ? 'kesimpulan_layak' : 'kesimpulan_tidak_layak';
  return ser(
    await simpan(user, u, input.updatedAt, { peringatan, 'evaluasi.kesimpulan': input.kesimpulan, 'evaluasi.oleh': oid(user.id), 'evaluasi.waktu': new Date() }, aksi),
  );
}

export async function simpanVerifikasi(user: SessionUser, id: string, input: z.infer<typeof S.verifikasiInput>) {
  pastikanBolehHibah(user, 'hibah_verifikasi');
  await sambung();
  const u = await muatUsulan(user, id);
  if (!['rekomendasi_diunggah', 'disetujui', 'ditolak', 'perbaikan'].includes(u.status))
    throw new Galat('VALIDASI', 'Hanya usulan yang rekomendasinya sudah diunggah yang dapat diverifikasi');
  await pastikanTidakTerkunci(u.tahun, String(u.skpdId));
  // verifikasi ulang setelah perbaikan berlaku di jadwal Perbaikan
  const [jv, jp] = await Promise.all([muatJadwal(u.tahun, 'verifikasi'), muatJadwal(u.tahun, 'perbaikan')]);
  if (!dalamJadwal(jv, String(u.skpdId)) && !dalamJadwal(jp, String(u.skpdId))) await cekJadwal(u.tahun, 'verifikasi', String(u.skpdId));
  const nilai = validasiVerifikasi(input, u.nilaiRekomendasi);
  const aksi = `putuskan_${input.keputusan}` as AksiStatus;
  return ser(
    await simpan(
      user,
      u,
      input.updatedAt,
      {
        'verifikasi.aspek': input.aspek,
        'verifikasi.keputusan': input.keputusan,
        'verifikasi.nilaiDisetujui': nilai,
        'verifikasi.alasan': input.alasan,
        'verifikasi.oleh': oid(user.id),
        'verifikasi.waktu': new Date(),
        nilaiDisetujui: nilai,
      },
      aksi,
      input.alasan,
    ),
  );
}

/* ---------- Daftar dan detail ---------- */

export async function daftarUsulan(user: SessionUser, f: z.infer<typeof S.filterUsulan>) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const tahun = f.tahun ?? (await tahunAktif()).tahun;
  const filter: Record<string, unknown> = { tahun, ...cakupanDbHibah(user) };
  if (f.skpd && !filter.skpdId) filter.skpdId = oid(f.skpd);
  if (f.jenis) filter.jenisPenerimaKode = f.jenis;
  if (f.bentuk) filter.bentuk = f.bentuk;
  if (f.status) filter.status = { $in: f.status.split(',') };
  if (f.peringatan) filter['peringatan.0'] = { $exists: true };
  if (f.q?.trim()) {
    const q = f.q.trim();
    const p = await HibahPenerima.find({ namaNormal: { $regex: escapeRegex(normalisasiNama(q)), $options: 'i' } }, { _id: 1 }).limit(500).lean();
    filter.$or = [{ nomor: { $regex: escapeRegex(q), $options: 'i' } }, { penerimaId: { $in: p.map((x) => x._id) } }];
  }
  const [data, total, ringkas] = await Promise.all([
    HibahUsulan.find(filter, { rincian: 0, 'evaluasi.checklist': 0, riwayatStatus: 0 })
      .sort({ updatedAt: -1 })
      .skip((f.page - 1) * f.limit)
      .limit(f.limit)
      .lean<Usulan[]>(),
    HibahUsulan.countDocuments(filter),
    HibahUsulan.aggregate<{ _id: string; n: number; usulan: number; rekomendasi: number; disetujui: number }>([
      { $match: filter },
      { $group: { _id: '$status', n: { $sum: 1 }, usulan: { $sum: '$nilaiUsulan' }, rekomendasi: { $sum: '$nilaiRekomendasi' }, disetujui: { $sum: { $ifNull: ['$nilaiDisetujui', 0] } } } },
    ]),
  ]);
  const [penerima, nama] = await Promise.all([
    HibahPenerima.find({ _id: { $in: data.map((d) => d.penerimaId) } }, { nama: 1, 'identitas.samaran': 1, desaKode: 1 }).lean(),
    petaNamaPd(data.map((d) => d.skpdId)),
  ]);
  const per = new Map(penerima.map((p) => [String(p._id), p]));
  return ser({
    tahun,
    data: data.map((d) => ({ ...d, penerima: per.get(String(d.penerimaId)) ?? null, namaPd: nama.get(String(d.skpdId)) ?? '' })),
    total,
    page: f.page,
    limit: f.limit,
    ringkas,
  });
}

export async function detailUsulan(user: SessionUser, id: string) {
  pastikanBolehHibah(user, 'hibah_lihat_usulan');
  await sambung();
  const u = await muatUsulan(user, id);
  const [p, j, nama, berkas, wajib, rek, kunci, jadwalPd] = await Promise.all([
    HibahPenerima.findById(u.penerimaId, { 'identitas.sandi': 0, 'identitas.sidik': 0, 'kk.sandi': 0, 'kk.sidik': 0 }).lean(),
    HibahJenisPenerima.findOne({ kode: u.jenisPenerimaKode }).lean(),
    petaNamaPd([u.skpdId]),
    HibahBerkas.find(
      { aktif: true, $or: [{ 'pemilik.jenis': 'usulan', 'pemilik.id': u._id }, { 'pemilik.jenis': 'penerima', 'pemilik.id': u.penerimaId }] },
      { gridfsId: 0, sha256: 0 },
    )
      .sort({ createdAt: -1 })
      .lean(),
    statusBerkasWajib(u),
    u.rekomendasiId ? HibahRekomendasi.findById(u.rekomendasiId, { nomor: 1, tanggal: 1, status: 1 }).lean() : null,
    terkunci(u.tahun, String(u.skpdId)),
    muatJadwal(u.tahun, tahapanAksiPd(u.status)),
  ]);
  const pemilik = peranHibah(user) === 'operator_pd' && String(u.skpdId) === user.skpdId;
  return ser({
    ...u,
    penerima: p,
    jenis: j,
    namaPd: nama.get(String(u.skpdId)) ?? '',
    berkas: berkas.filter((b) => !b.sensitif || bolehHibah(user, 'hibah_buka_ktp')).map((b) => b),
    berkasSensitifTersembunyi: berkas.filter((b) => b.sensitif && !bolehHibah(user, 'hibah_buka_ktp')).length,
    berkasWajib: wajib,
    rekomendasi: rek,
    terkunci: kunci,
    hak: {
      ubah: pemilik && bisaDiubahPd(u.status),
      evaluasi: pemilik && (u.status === 'evaluasi' || u.status === 'perbaikan'),
      verifikasi: bolehHibah(user, 'hibah_verifikasi') && ['rekomendasi_diunggah', 'disetujui', 'ditolak', 'perbaikan'].includes(u.status) && !kunci,
      dalamJadwalPd: dalamJadwal(jadwalPd, String(u.skpdId)),
    },
  });
}
