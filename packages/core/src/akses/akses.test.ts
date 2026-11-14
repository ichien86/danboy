import { describe, expect, it } from 'vitest';
import { boleh, cakupan, dalamCakupan, pastikanBoleh, type SessionUser } from './index';
import { Galat } from '../galat';

const sa: SessionUser = { id: '1', username: 'sa', nama: 'SA', peran: 'super_admin' };
const ad: SessionUser = { id: '2', username: 'ad', nama: 'Admin', peran: 'admin' };
const sk: SessionUser = { id: '3', username: 'sk', nama: 'SKPD', peran: 'skpd', skpdId: 'a1' };

describe('akses', () => {
  it('matriks izin', () => {
    expect(boleh(sa, 'kelola_pengguna')).toBe(true);
    expect(boleh(ad, 'kelola_pengguna')).toBe(false);
    expect(boleh(ad, 'kelola_tahapan')).toBe(false);
    expect(boleh(ad, 'ubah_alokasi')).toBe(true);
    expect(boleh(sk, 'ubah_alokasi')).toBe(false);
    expect(boleh(sk, 'impor')).toBe(false);
    expect(boleh(sk, 'lihat')).toBe(true);
    expect(boleh(sk, 'lihat_audit')).toBe(false);
    expect(boleh(null, 'lihat')).toBe(false);
  });

  it('pastikanBoleh melempar galat yang tepat', () => {
    expect(() => pastikanBoleh(null, 'lihat')).toThrow(Galat);
    let galat: Galat | undefined;
    try {
      pastikanBoleh(sk, 'impor');
    } catch (e) {
      galat = e as Galat;
    }
    expect(galat?.kode).toBe('TIDAK_BERHAK');
    expect(galat?.http).toBe(403);
    expect(() => pastikanBoleh(ad, 'impor')).not.toThrow();
  });

  it('cakupan SKPD membatasi skpdId; admin tanpa batas', () => {
    expect(cakupan(sk)).toEqual({ skpdId: 'a1' });
    expect(cakupan(ad)).toEqual({});
    expect(cakupan(sa)).toEqual({});
    expect(() => cakupan({ ...sk, skpdId: null })).toThrow(Galat);
  });

  it('dalamCakupan', () => {
    expect(dalamCakupan(sk, { skpdId: 'a1' })).toBe(true);
    expect(dalamCakupan(sk, { skpdId: 'b2' })).toBe(false);
    expect(dalamCakupan(ad, { skpdId: 'b2' })).toBe(true);
    expect(dalamCakupan(ad, null)).toBe(false);
  });
});
