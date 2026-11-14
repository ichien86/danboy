import { denganKonteks } from '@danboy/db';
import type { DataJob, NamaJob } from '../services/antrean';
import { prosesApbd, terapkanApbd } from '../services/impor';
import { prosesMaster, terapkanMaster } from '../services/impor-master';
import { jalankanJadwal, salinDanBuka } from '../services/tahapan';
import { prosesVerifikasi } from '../services/verifikasi';

/** Satu pintu eksekusi job, dipakai worker BullMQ maupun mode in-process. */
export async function jalankanJob(nama: NamaJob, data: DataJob): Promise<unknown> {
  return denganKonteks({ userId: data.userId, ip: data.ip }, async () => {
    switch (nama) {
      case 'imporApbd:proses':
        return prosesApbd(data.batchId!);
      case 'imporApbd:terapkan':
        return terapkanApbd(data.batchId!);
      case 'imporMaster:proses':
        return prosesMaster(data.batchId!);
      case 'imporMaster:terapkan':
        return terapkanMaster(data.batchId!);
      case 'verifikasi:proses':
        return prosesVerifikasi(data.batchId!);
      case 'salinTahapan':
        return salinDanBuka(data.tahapanId!);
      case 'jadwalTahapan':
        return jalankanJadwal();
      default:
        throw new Error(`Job tidak dikenal: ${nama satisfies never}`);
    }
  });
}

export type { NamaJob, DataJob };
