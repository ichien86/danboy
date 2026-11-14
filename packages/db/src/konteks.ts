import { AsyncLocalStorage } from 'node:async_hooks';

export interface KonteksPermintaan {
  userId?: string;
  ip?: string;
}

const penyimpanan = new AsyncLocalStorage<KonteksPermintaan>();

/** Jalankan fn dengan identitas pengguna dan IP, dibaca plugin audit. */
export function denganKonteks<T>(k: KonteksPermintaan, fn: () => Promise<T>): Promise<T> {
  return penyimpanan.run(k, fn);
}

export const konteksSaatIni = (): KonteksPermintaan => penyimpanan.getStore() ?? {};
