import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isiTemplat, periksaTemplat, teksDocx, templatBawaan } from '@danboy/cetak';
import {
  cekNilaiRekomendasi, dalamJadwal, hitungNilai, jaroWinkler, namaMirip, normalisasiNama, terbilang, transisi, validasiIdentitas, validasiVerifikasi,
} from './aturan';
import { bungkusIdentitas, dekripsi, samaran, sidik } from './rahasia';

const aspek = (m: boolean | null) => (['tusi', 'program', 'duplikasi', 'keuangan'] as const).map((kode) => ({ kode, memenuhi: m, catatan: '' }));

describe('aturan modul Hibah dan Bansos', () => {
  it('BR-01 dan BR-02: nilai dihitung dari rincian; rekomendasi tidak melebihi usulan', () => {
    const n = hitungNilai([{ volume: 2.5, hargaSatuan: 300_001, nilaiRekomendasi: 700_000 }, { volume: 1, hargaSatuan: 50_000 }]);
    expect(n.baris.map((b) => b.jumlah)).toEqual([750_003, 50_000]);
    expect(n.nilaiUsulan).toBe(800_003);
    expect(n.nilaiRekomendasi).toBe(700_000);
    expect(cekNilaiRekomendasi([{ jumlah: 100, nilaiRekomendasi: 101 }, { jumlah: 100, nilaiRekomendasi: 100 }])).toEqual({ 'rincian.0': expect.any(String) });
  });

  it('BR-10: ditolak = Rp0; alasan wajib untuk ditolak, perbaikan, atau nilai berbeda', () => {
    expect(validasiVerifikasi({ aspek: aspek(false), keputusan: 'ditolak', nilaiDisetujui: 999, alasan: 'x' }, 500)).toBe(0);
    expect(() => validasiVerifikasi({ aspek: aspek(true), keputusan: 'disetujui', nilaiDisetujui: 600, alasan: '' }, 500)).toThrow();
    expect(validasiVerifikasi({ aspek: aspek(true), keputusan: 'disetujui', nilaiDisetujui: 500, alasan: '' }, 500)).toBe(500);
    expect(validasiVerifikasi({ aspek: aspek(true), keputusan: 'disetujui', nilaiDisetujui: 600, alasan: 'naik' }, 500)).toBe(600);
    expect(() => validasiVerifikasi({ aspek: aspek(null), keputusan: 'perbaikan', nilaiDisetujui: null, alasan: '' }, 500)).toThrow();
    expect(() => validasiVerifikasi({ aspek: aspek(null), keputusan: 'disetujui', nilaiDisetujui: 500, alasan: '' }, 500)).toThrow();
  });

  it('mesin status menolak perpindahan yang tidak sah', () => {
    expect(transisi('draf', 'kirim')).toBe('evaluasi');
    expect(transisi('perbaikan', 'kirim_ulang')).toBe('rekomendasi_diunggah');
    expect(() => transisi('draf', 'unggah_rekomendasi')).toThrow();
    expect(() => transisi('evaluasi', 'kirim_ulang')).toThrow();
    expect(() => transisi('disetujui', 'kirim')).toThrow();
  });

  it('BR-11: jadwal berlaku sampai akhir hari WIB, dan perpanjangan per PD', () => {
    const j = { tahapan: 'input' as const, mulai: new Date('2026-11-01T00:00:00+07:00'), selesai: new Date('2026-11-30T00:00:00+07:00'), perpanjangan: [{ skpdId: 'pd1', selesaiBaru: new Date('2026-12-05T00:00:00+07:00') }] };
    expect(dalamJadwal(j, null, new Date('2026-11-30T23:30:00+07:00'))).toBe(true);
    expect(dalamJadwal(j, null, new Date('2026-12-01T00:10:00+07:00'))).toBe(false);
    expect(dalamJadwal(j, 'pd1', new Date('2026-12-05T22:00:00+07:00'))).toBe(true);
    expect(dalamJadwal(j, null, new Date('2026-10-31T23:00:00+07:00'))).toBe(false);
    expect(dalamJadwal(null, null)).toBe(false);
  });

  it('FR-11: normalisasi nama dan kemiripan', () => {
    expect(normalisasiNama('Yayasan  Al-Ikhlas, S.Pd.')).toBe('al ikhlas');
    expect(normalisasiNama('H. Ahmad Dahlan')).toBe('ahmad dahlan');
    expect(namaMirip('Budi Santoso', 'Budi Santosa')).toBe(true);
    expect(namaMirip('Budi Santoso', 'Siti Aminah')).toBe(false);
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 2);
  });

  it('BR-04: NIK 16 digit; Keluarga juga nomor KK', () => {
    expect(() => validasiIdentitas('nik', '123')).toThrow();
    expect(() => validasiIdentitas('nik', '3309123412340001')).not.toThrow();
    expect(() => validasiIdentitas('nik_kk', '3309123412340001', null)).toThrow();
    expect(() => validasiIdentitas('badan_hukum', '')).not.toThrow();
  });

  it('terbilang', () => {
    expect(terbilang(2_150_003)).toBe('dua juta seratus lima puluh ribu tiga rupiah');
    expect(terbilang(11_000)).toBe('sebelas ribu rupiah');
  });

  it('enkripsi dan sidik identitas', () => {
    process.env.KUNCI_ENKRIPSI = randomBytes(32).toString('base64');
    process.env.KUNCI_SIDIK = randomBytes(32).toString('base64');
    const b = bungkusIdentitas('nik', '3309 1234 1234 0001');
    expect(dekripsi(b.sandi)).toBe('3309123412340001');
    expect(b.sidik).toBe(sidik('nik', '3309123412340001'));
    expect(sidik('nik_kk', '3309123412340001')).toBe(b.sidik);
    expect(sidik('badan_hukum', '3309123412340001')).not.toBe(b.sidik);
    expect(samaran('3309123412340001')).toBe('3309••••••••0001');
  });

  it('templat bawaan lolos pemeriksaan dan bisa diisi', () => {
    expect(periksaTemplat(templatBawaan('rekomendasi'), 'rekomendasi', { usulan: [], lampiran: [] })).toEqual([]);
    expect(periksaTemplat(templatBawaan('berita_acara'), 'berita_acara', { rekap: [], tapd: [], dasarHukum: [] })).toEqual([]);
    expect(periksaTemplat(Buffer.from('bukan docx'), 'lampiran', {})).not.toEqual([]);
    const isi = isiTemplat(templatBawaan('lampiran'), { judul: 'LAMPIRAN I', baris: [{ no: 1, nama: 'Penerima A' }, { no: 2, nama: 'Penerima B' }] });
    const t = teksDocx(isi);
    expect(t).toContain('Penerima A');
    expect(t).toContain('Penerima B');
    expect(t).not.toContain('{');
  });
});
