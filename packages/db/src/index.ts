export * from './koneksi';
export * from './models';
export * from './gridfs';
export * from './konteks';
export { auditPlugin, catatAudit, selisih } from './audit';
import * as M from './models';

/** Semua model, untuk migrasi indeks. */
export const semuaModel = [
  M.Skpd, M.SubUnit, M.User, M.Nomenklatur, M.Rekening, M.SumberDana, M.Tagging, M.TahunAnggaran, M.Tahapan,
  M.PaguSumberDana, M.SubkegiatanTahapan, M.ImporBatch, M.ImporBaris, M.HasilBanding, M.Notifikasi, M.LogAudit,
];

import mongoose from "mongoose";
export const oid = (v: unknown) => new mongoose.Types.ObjectId(String(v));
export const idValid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);
