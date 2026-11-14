import { Readable } from 'node:stream';
import mongoose from 'mongoose';
import { sambung } from './koneksi';

async function bucket() {
  await sambung();
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'unggahan' });
}

export async function simpanFile(nama: string, isi: Buffer, metadata: Record<string, unknown> = {}): Promise<mongoose.Types.ObjectId> {
  const b = await bucket();
  return new Promise((resolve, reject) => {
    const up = b.openUploadStream(nama, { metadata });
    Readable.from(isi).pipe(up).on('error', reject).on('finish', () => resolve(up.id as mongoose.Types.ObjectId));
  });
}

export async function bacaFile(id: mongoose.Types.ObjectId | string): Promise<Buffer> {
  const b = await bucket();
  const potongan: Buffer[] = [];
  for await (const c of b.openDownloadStream(new mongoose.Types.ObjectId(String(id)))) potongan.push(c as Buffer);
  return Buffer.concat(potongan);
}

export async function hapusFile(id: mongoose.Types.ObjectId | string) {
  const b = await bucket();
  await b.delete(new mongoose.Types.ObjectId(String(id))).catch(() => undefined);
}
