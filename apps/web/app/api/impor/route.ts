import { rute, angka } from '@/lib/api';
import * as svc from '@danboy/core/services';
import * as S from '@danboy/schema';
import { Galat } from '@danboy/core';

export const GET = rute(async ({ user, query }) =>
  svc.daftarImpor(user, { jenis: query.jenis, tahapanId: query.tahapanId, page: angka(query.page, 1), limit: angka(query.limit, 20) }),
);

/** multipart: jenis, tahapanId?, tahun?, versi?, file */
export const POST = rute(async ({ req, user }) => {
  const batas = svc.batasUnggahMb() * 1024 * 1024;
  const panjang = Number(req.headers.get('content-length') ?? 0);
  if (panjang > batas + 64 * 1024) throw new Galat('FILE_TERLALU_BESAR', `Ukuran file melebihi ${svc.batasUnggahMb()} MB`);
  const fd = await req.formData().catch(() => {
    throw new Galat('VALIDASI', 'Form unggahan tidak valid');
  });
  const file = fd.get('file');
  if (!(file instanceof File)) throw new Galat('VALIDASI', 'File wajib dipilih');
  const jenis = S.jenisImpor.parse(fd.get('jenis'));
  const tahun = fd.get('tahun') ? Number(fd.get('tahun')) : undefined;
  return svc.unggahImpor(user, {
    jenis,
    tahapanId: (fd.get('tahapanId') as string) || undefined,
    tahun: Number.isInteger(tahun) ? tahun : undefined,
    versi: ((fd.get('versi') as string) || '').trim().slice(0, 80) || undefined,
    namaFile: file.name.slice(0, 200),
    isi: Buffer.from(await file.arrayBuffer()),
  });
});
