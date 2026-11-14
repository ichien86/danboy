import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { bacaBarisMentah, bacaTabel } from './index';

async function buatXlsx(baris: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sumber Dana');
  baris.forEach((b) => ws.addRow(b));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Susun ulang isi arsip agar xl/sharedStrings.xml berada SETELAH lembar data (seperti file dari Google Sheets). */
async function teksSetelahLembar(isi: Buffer): Promise<Buffer> {
  const asal = await JSZip.loadAsync(isi);
  const nama = Object.keys(asal.files).filter((n) => !asal.files[n].dir);
  const urut = [...nama.filter((n) => n !== 'xl/sharedStrings.xml'), 'xl/sharedStrings.xml'];
  const baru = new JSZip();
  for (const n of urut) baru.file(n, await asal.file(n)!.async('uint8array'));
  return Buffer.from(await baru.generateAsync({ type: 'uint8array' }));
}

const kumpul = async (isi: Buffer) => {
  const out = [];
  for await (const r of bacaBarisMentah(isi, 'xlsx')) out.push(r);
  return out;
};

const DATA = [
  ['KODE SUMBER DANA', 'NAMA SUMBER DANA'],
  ['1.2.01.08', 'Dana Alokasi Umum (DAU)'],
  ['2.2.01.09.002.00026', 'DAK Non Fisik-Dana BOSP-BOS Reguler'],
];

describe('pembaca xlsx', () => {
  it('membaca file biasa', async () => {
    expect(await kumpul(await buatXlsx(DATA))).toEqual(DATA);
  });

  it('membaca file yang daftar teksnya tersimpan setelah lembar data', async () => {
    const isi = await teksSetelahLembar(await buatXlsx(DATA));
    const z = await JSZip.loadAsync(isi);
    const urutan = Object.keys(z.files);
    expect(urutan.indexOf('xl/sharedStrings.xml')).toBeGreaterThan(urutan.indexOf('xl/worksheets/sheet1.xml'));
    expect(await kumpul(isi)).toEqual(DATA);
    const tabel = [];
    for await (const r of bacaTabel(isi, 'xlsx', { kolomWajib: ['KODE SUMBER DANA', 'NAMA SUMBER DANA'] })) tabel.push(r.data);
    expect(tabel[0]).toEqual({ 'KODE SUMBER DANA': '1.2.01.08', 'NAMA SUMBER DANA': 'Dana Alokasi Umum (DAU)' });
  });
});
