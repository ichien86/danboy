export const KODE_HTTP = {
  VALIDASI: 400,
  BELUM_LOGIN: 401,
  TIDAK_BERHAK: 403,
  TIDAK_DITEMUKAN: 404,
  DATA_BERUBAH: 409,
  IMPOR_BERJALAN: 409,
  PERLU_KONFIRMASI: 409,
  FILE_TERLALU_BESAR: 413,
  FORMAT_FILE: 422,
  TAHAPAN_TERKUNCI: 423,
  /** Modul Hibah dan Bansos: aksi di luar jadwal tahapannya (BR-11). */
  DI_LUAR_JADWAL: 409,
  /** Identitas penerima sudah dipakai kartu lain (BR-03); detail berisi ID kartu yang ada. */
  DUPLIKAT: 409,
  GALAT_SERVER: 500,
} as const;

export type KodeGalat = keyof typeof KODE_HTTP;

/** Galat bisnis yang diterjemahkan route handler menjadi respons { galat: { kode, pesan, detail } }. */
export class Galat extends Error {
  constructor(
    public readonly kode: KodeGalat,
    pesan: string,
    public readonly detail?: unknown,
  ) {
    super(pesan);
    this.name = 'Galat';
  }
  get http(): number {
    return KODE_HTTP[this.kode];
  }
}

export const tidakDitemukan = (apa = 'Data') => new Galat('TIDAK_DITEMUKAN', `${apa} tidak ditemukan`);
