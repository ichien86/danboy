import mongoose, { Schema, type ClientSession, type Query } from 'mongoose';
import { konteksSaatIni } from './konteks';

export interface LogAuditDoc {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  aksi: string;
  koleksi: string;
  dokumenId?: mongoose.Types.ObjectId;
  sebelum?: Record<string, unknown>;
  sesudah?: Record<string, unknown>;
  ip?: string;
  waktu: Date;
}

const logAuditSchema = new Schema<LogAuditDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    aksi: { type: String, required: true },
    koleksi: { type: String, required: true },
    dokumenId: { type: Schema.Types.ObjectId },
    sebelum: Schema.Types.Mixed,
    sesudah: Schema.Types.Mixed,
    ip: String,
    waktu: { type: Date, default: () => new Date() },
  },
  { versionKey: false, minimize: false },
);
logAuditSchema.index({ koleksi: 1, dokumenId: 1, waktu: -1 });
logAuditSchema.index({ waktu: -1 });

export const LogAudit =
  (mongoose.models.LogAudit as mongoose.Model<LogAuditDoc>) || mongoose.model<LogAuditDoc>('LogAudit', logAuditSchema, 'logAudit');

const ABAIKAN = new Set(['updatedAt', 'createdAt', 'passwordHash', 'totpSecret']);
/** Field rahasia di dalam dokumen (NIK terenkripsi, sidik HMAC, token Google): nilainya tidak pernah masuk log. */
const RAHASIA = new Set(['sandi', 'sidik', 'tokenTerenkripsi', 'sidikIdentitas']);

function samarkan(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(samarkan);
  if (v && typeof v === 'object' && !(v instanceof Date) && !('_bsontype' in (v as object))) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, RAHASIA.has(k) && x ? '(rahasia)' : samarkan(x)]));
  }
  return v;
}

/** Hanya field yang berubah; rahasia tidak pernah dicatat. */
export function selisih(a0: Record<string, unknown> | null | undefined, b0: Record<string, unknown> | null | undefined) {
  // rahasia dibandingkan dari nilai asli agar perubahannya tetap tercatat sebagai "(diubah)"
  const a = samarkan(a0) as Record<string, unknown> | null | undefined;
  const b = samarkan(b0) as Record<string, unknown> | null | undefined;
  const sebelum: Record<string, unknown> = {};
  const sesudah: Record<string, unknown> = {};
  const kunci = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of kunci) {
    if (ABAIKAN.has(k) || k === '_id') continue;
    const va = a?.[k];
    const vb = b?.[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      sebelum[k] = va;
      sesudah[k] = vb;
    } else if (JSON.stringify(a0?.[k]) !== JSON.stringify(b0?.[k])) {
      // yang berubah hanya isi rahasia (mis. NIK diganti): catat bahwa berubah tanpa nilainya
      sesudah[k] = '(rahasia diubah)';
    }
  }
  if ((a && 'passwordHash' in a) || (b && 'passwordHash' in b)) {
    if (a?.passwordHash !== b?.passwordHash) sesudah.passwordHash = '(diubah)';
  }
  return { sebelum, sesudah, berubah: Object.keys(sebelum).length > 0 || Object.keys(sesudah).length > 0 };
}

export async function catatAudit(
  entri: Omit<LogAuditDoc, '_id' | 'waktu' | 'userId' | 'ip'> & { userId?: string; ip?: string },
  session?: ClientSession | null,
) {
  const k = konteksSaatIni();
  const userId = entri.userId ?? k.userId;
  await LogAudit.create(
    [
      {
        ...entri,
        userId: userId && mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : undefined,
        ip: entri.ip ?? k.ip,
        waktu: new Date(),
      },
    ],
    { session: session ?? undefined },
  );
}

type QueryAudit = Query<unknown, unknown> & { _auditLama?: Record<string, unknown> | null };

/**
 * Plugin audit: findOneAndUpdate mencatat sebelum/sesudah (hanya field yang berubah),
 * save dokumen baru mencatat aksi "buat". Operasi massal mencatat entri ringkasan sendiri.
 */
export function auditPlugin(schema: Schema, opsi: { koleksi: string }) {
  schema.pre('findOneAndUpdate', async function (this: QueryAudit) {
    const session = this.getOptions().session as ClientSession | undefined;
    this._auditLama = (await this.model.findOne(this.getFilter()).session(session ?? null).lean()) as Record<
      string,
      unknown
    > | null;
  });
  schema.post('findOneAndUpdate', async function (this: QueryAudit, hasil: unknown) {
    const lama = this._auditLama;
    if (!lama) return;
    const o = this.getOptions() as { session?: ClientSession; new?: boolean; returnDocument?: string; rawResult?: boolean; includeResultMetadata?: boolean };
    const session = o.session;
    // hasil query sudah berupa dokumen utuh sesudah diubah (lean, new: true, tanpa proyeksi) -> tidak perlu dibaca lagi
    const proyeksi = this.projection() as Record<string, unknown> | undefined;
    const pakaiHasil =
      !!hasil &&
      (o.new === true || o.returnDocument === 'after') &&
      !o.rawResult &&
      !o.includeResultMetadata &&
      !!(this as unknown as { _mongooseOptions?: { lean?: unknown } })._mongooseOptions?.lean &&
      (!proyeksi || Object.keys(proyeksi).length === 0);
    const baru = pakaiHasil
      ? (hasil as Record<string, unknown>)
      : ((await this.model.findById(lama._id).session(session ?? null).lean()) as Record<string, unknown> | null);
    const d = selisih(lama, baru);
    if (!d.berubah) return;
    await catatAudit(
      { aksi: 'ubah', koleksi: opsi.koleksi, dokumenId: lama._id as mongoose.Types.ObjectId, sebelum: d.sebelum, sesudah: d.sesudah },
      session,
    );
  });
  schema.pre('save', function () {
    (this as unknown as { _auditBaru: boolean })._auditBaru = this.isNew;
  });
  schema.post('save', async function (doc) {
    if (!(this as unknown as { _auditBaru: boolean })._auditBaru) return;
    const obj = doc.toObject() as Record<string, unknown>;
    const d = selisih({}, obj);
    await catatAudit({ aksi: 'buat', koleksi: opsi.koleksi, dokumenId: doc._id as mongoose.Types.ObjectId, sesudah: d.sesudah }, doc.$session());
  });
}
