import { describe, expect, it } from 'vitest';
import { boleh, cakupan, dalamCakupan, type SessionUser } from './index';
import { bolehHibah, cakupanHibah, dalamCakupanHibah, modulDiizinkan, pastikanBolehHibah, peranHibah } from './hibah';
import { Galat } from '../galat';

const sa: SessionUser = { id: '1', username: 'sa', nama: 'SA', peran: 'super_admin' };
const ad: SessionUser = { id: '2', username: 'ad', nama: 'Admin', peran: 'admin' };
const sk: SessionUser = { id: '3', username: 'sk', nama: 'SKPD', peran: 'skpd', skpdId: 'a1' };
const ap: SessionUser = { id: '4', username: 'ap', nama: 'Perencana', peran: null, aksesHibah: 'admin_perencana' };
const vf: SessionUser = { id: '5', username: 'vf', nama: 'Verifikator', peran: null, aksesHibah: 'verifikator' };
const ag: SessionUser = { id: '6', username: 'ag', nama: 'Anggota', peran: null, aksesHibah: 'anggota' };
// satu akun boleh memegang dua modul dengan peran berbeda
const adVf: SessionUser = { id: '7', username: 'adv', nama: 'Admin + Verifikator', peran: 'admin', aksesHibah: 'verifikator' };

describe('peran modul Hibah dan Bansos', () => {
  it('akun SKPD otomatis Operator PD, akun lain dari aksesHibah', () => {
    expect(peranHibah(sk)).toBe('operator_pd');
    // aksesHibah yang tersimpan di akun SKPD diabaikan
    expect(peranHibah({ ...sk, aksesHibah: 'verifikator' })).toBe('operator_pd');
    expect(peranHibah(ap)).toBe('admin_perencana');
    expect(peranHibah(sa)).toBeNull();
    expect(peranHibah(ad)).toBeNull();
    expect(peranHibah(null)).toBeNull();
  });

  it('modul yang boleh dibuka', () => {
    expect(modulDiizinkan(sa)).toEqual(['danboy']);
    expect(modulDiizinkan(sk)).toEqual(['danboy', 'hibah']);
    expect(modulDiizinkan(ap)).toEqual(['hibah']);
    expect(modulDiizinkan(adVf)).toEqual(['danboy', 'hibah']);
    expect(modulDiizinkan({ ...ap, aksesHibah: null })).toEqual([]);
  });

  it('matriks aksi', () => {
    expect(bolehHibah(ap, 'hibah_kelola_master')).toBe(true);
    expect(bolehHibah(ap, 'hibah_buka_kunci')).toBe(true);
    expect(bolehHibah(ap, 'hibah_input_usulan')).toBe(false);
    expect(bolehHibah(ap, 'hibah_verifikasi')).toBe(false);
    expect(bolehHibah(sk, 'hibah_input_usulan')).toBe(true);
    expect(bolehHibah(sk, 'hibah_kelola_templat_pd')).toBe(true);
    expect(bolehHibah(sk, 'hibah_kelola_master')).toBe(false);
    expect(bolehHibah(sk, 'hibah_verifikasi')).toBe(false);
    expect(bolehHibah(vf, 'hibah_verifikasi')).toBe(true);
    expect(bolehHibah(vf, 'hibah_kunci')).toBe(true);
    expect(bolehHibah(vf, 'hibah_buka_kunci')).toBe(false);
    expect(bolehHibah(vf, 'hibah_buka_ktp')).toBe(true);
    expect(bolehHibah(ag, 'hibah_lihat_rekap')).toBe(true);
    expect(bolehHibah(ag, 'hibah_lihat_usulan')).toBe(false);
    expect(bolehHibah(ag, 'hibah_buka_ktp')).toBe(false);
    // Super Admin DANBOY tidak otomatis masuk modul ini
    expect(bolehHibah(sa, 'hibah_lihat_rekap')).toBe(false);
    expect(bolehHibah(adVf, 'hibah_verifikasi')).toBe(true);
  });

  it('pastikanBolehHibah melempar galat yang tepat', () => {
    expect(() => pastikanBolehHibah(null, 'hibah_lihat_rekap')).toThrow(Galat);
    try {
      pastikanBolehHibah(ag, 'hibah_input_usulan');
      expect.unreachable();
    } catch (e) {
      expect((e as Galat).kode).toBe('TIDAK_BERHAK');
    }
    expect(() => pastikanBolehHibah(sk, 'hibah_input_usulan')).not.toThrow();
  });

  it('cakupan: Operator PD hanya PD-nya, peran lain semua PD', () => {
    expect(cakupanHibah(sk)).toEqual({ skpdId: 'a1' });
    expect(cakupanHibah(vf)).toEqual({});
    expect(cakupanHibah(ap)).toEqual({});
    expect(() => cakupanHibah(sa)).toThrow(Galat);
    expect(() => cakupanHibah({ ...sk, skpdId: null })).toThrow(Galat);
    expect(dalamCakupanHibah(sk, { skpdId: 'a1' })).toBe(true);
    expect(dalamCakupanHibah(sk, { skpdId: 'b2' })).toBe(false);
    expect(dalamCakupanHibah(vf, { skpdId: 'b2' })).toBe(true);
    expect(dalamCakupanHibah(vf, null)).toBe(false);
  });
});

describe('akun tanpa peran DANBOY', () => {
  it('tidak punya aksi DANBOY dan tidak mendapat cakupan "semua"', () => {
    expect(boleh(ap, 'lihat')).toBe(false);
    expect(boleh(vf, 'ekspor')).toBe(false);
    expect(() => cakupan(ap)).toThrow(Galat);
    expect(dalamCakupan(ap, { skpdId: 'a1' })).toBe(false);
    // akun yang memegang dua modul tetap memakai peran DANBOY-nya
    expect(boleh(adVf, 'ubah_alokasi')).toBe(true);
  });
});
