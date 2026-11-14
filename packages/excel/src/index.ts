import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse';

export type JenisFile = 'xlsx' | 'csv';
export type Sel = string | number | boolean | null;

/** Nama kolom dicocokkan tanpa peduli urutan, huruf besar-kecil, dan spasi. */
export const normalHeader = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Periksa tanda tangan file: xlsx = arsip ZIP (PK\x03\x04); csv = teks tanpa byte NUL. */
export function deteksiJenis(namaFile: string, isi: Buffer): JenisFile | null {
  const ext = namaFile.toLowerCase().split('.').pop();
  if (ext === 'xlsx') return isi.length > 4 && isi.readUInt32LE(0) === 0x04034b50 ? 'xlsx' : null;
  if (ext === 'csv') return isi.subarray(0, 4096).includes(0) ? null : 'csv';
  return null;
}

function nilaiSel(v: ExcelJS.CellValue): Sel {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    // Formula tidak dievaluasi; hanya hasil tersimpan yang dipakai.
    if ('result' in v) return nilaiSel((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ('error' in v) return null;
  }
  return String(v);
}

/** Sel yang masih berupa rujukan ke daftar teks bersama yang belum terbaca. */
const rujukanTeks = (v: ExcelJS.CellValue) => !!v && typeof v === 'object' && 'sharedString' in (v as object);

const ubahBaris = (vals: ExcelJS.CellValue[]): Sel[] => {
  const out: Sel[] = [];
  for (let i = 1; i < vals.length; i++) out.push(nilaiSel(vals[i]));
  return out;
};

/**
 * Baca sheet pertama .xlsx. Utamanya secara streaming (hemat memori untuk file SIPD besar). Namun bila daftar teks
 * bersama (xl/sharedStrings.xml) tersimpan SETELAH lembar data di dalam arsip — umum pada file dari Google Sheets atau
 * aplikasi selain Excel — pembaca streaming hanya memberi {sharedString: n}. Itu terdeteksi di baris-baris awal, dan
 * file lalu dibaca utuh (non-streaming) yang selalu benar.
 */
async function* bacaXlsx(isi: Buffer): AsyncGenerator<Sel[]> {
  const PERIKSA = 50;
  let awal: ExcelJS.CellValue[][] | null = [];
  let perluUtuh = false;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(isi), {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
    entries: 'emit',
  });
  try {
    // baris dibaca di DALAM perulangan lembar: keluar dari perulangan lebih dulu akan menutup pembaca streaming
    for await (const ws of reader) {
      for await (const row of ws as AsyncIterable<ExcelJS.Row>) {
        const vals = row.values as ExcelJS.CellValue[];
        if (vals.some(rujukanTeks)) {
          if (awal === null) throw new GalatFormat('Isi file .xlsx tidak bisa dibaca dengan benar; simpan ulang dengan Microsoft Excel lalu unggah lagi');
          perluUtuh = true;
          break;
        }
        if (awal === null) {
          yield ubahBaris(vals);
          continue;
        }
        // tahan beberapa baris pertama sampai yakin teksnya sudah terbaca
        awal.push(vals);
        if (awal.length >= PERIKSA) {
          for (const v of awal) yield ubahBaris(v);
          awal = null;
        }
      }
      break; // hanya sheet pertama
    }
  } catch (e) {
    // Pembaca streaming ExcelJS gagal bila workbook.xml tersimpan setelah lembar data (mis. file buatan ExcelJS
    // atau aplikasi lain). Selama belum ada baris yang diserahkan, aman beralih ke pembacaan utuh.
    if (awal === null || e instanceof GalatFormat) throw e;
    perluUtuh = true;
  }
  if (perluUtuh) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(isi as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return;
    for (let r = 1; r <= ws.rowCount; r++) yield ubahBaris(ws.getRow(r).values as ExcelJS.CellValue[]);
    return;
  }
  if (awal) for (const v of awal) yield ubahBaris(v);
}

/** Baris mentah (array sel) dari file, dibaca secara streaming. */
export async function* bacaBarisMentah(isi: Buffer, jenis: JenisFile): AsyncGenerator<Sel[]> {
  if (jenis === 'xlsx') {
    yield* bacaXlsx(isi);
    return;
  }
  let teks = isi.toString('utf8');
  if (teks.charCodeAt(0) === 0xfeff) teks = teks.slice(1);
  const barisPertama = teks.slice(0, teks.indexOf('\n') >>> 0 || 2000);
  const kandidat = [';', ',', '\t', '|'];
  const delimiter = kandidat.reduce((a, b) => (barisPertama.split(b).length > barisPertama.split(a).length ? b : a), ',');
  const parser = Readable.from([teks]).pipe(
    parse({ delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false, bom: true }),
  );
  for await (const rec of parser as AsyncIterable<string[]>) yield rec;
}

export interface OpsiTabel {
  /** Kolom wajib (sudah dinormalisasi huruf besar). */
  kolomWajib: string[];
  /** Cari baris header di N baris pertama. */
  cariHeaderDalam?: number;
}

export interface BarisTabel {
  noBaris: number;
  data: Record<string, Sel>;
}

export class GalatFormat extends Error {
  constructor(
    pesan: string,
    public kolomHilang: string[] = [],
  ) {
    super(pesan);
  }
}

/** Baca tabel berheader. Melempar GalatFormat bila kolom wajib tidak ditemukan. */
export async function* bacaTabel(isi: Buffer, jenis: JenisFile, opsi: OpsiTabel): AsyncGenerator<BarisTabel> {
  const batas = opsi.cariHeaderDalam ?? 20;
  let header: string[] | null = null;
  let no = 0;
  const awal: Sel[][] = [];
  for await (const r of bacaBarisMentah(isi, jenis)) {
    no++;
    if (!header) {
      awal.push(r);
      const h = r.map(normalHeader);
      if (opsi.kolomWajib.every((k) => h.includes(k))) {
        header = h;
        continue;
      }
      if (no >= batas) break;
      continue;
    }
    if (r.every((c) => c === null || String(c).trim() === '')) continue;
    const data: Record<string, Sel> = {};
    header.forEach((k, i) => {
      if (k && !(k in data)) data[k] = r[i] ?? null;
    });
    yield { noBaris: no, data };
  }
  if (!header) {
    const terbaik = awal.map((r) => r.map(normalHeader)).sort(
      (a, b) => opsi.kolomWajib.filter((k) => b.includes(k)).length - opsi.kolomWajib.filter((k) => a.includes(k)).length,
    )[0] ?? [];
    throw new GalatFormat(
      'Kolom wajib tidak ditemukan',
      opsi.kolomWajib.filter((k) => !terbaik.includes(k)),
    );
  }
}

export interface KolomEkspor {
  header: string;
  key: string;
  width?: number;
  rupiah?: boolean;
}

export interface SheetEkspor {
  nama: string;
  kolom: KolomEkspor[];
  baris: Record<string, unknown>[];
  judul?: string;
}

/** Buat workbook .xlsx; kolom rupiah diformat #.##0 dan dijumlah di baris terakhir. */
export async function buatXlsx(sheets: SheetEkspor[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DANBOY';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.nama.slice(0, 31));
    let mulai = 1;
    if (s.judul) {
      ws.getCell(1, 1).value = s.judul;
      ws.getCell(1, 1).font = { bold: true, size: 13 };
      mulai = 3;
    }
    s.kolom.forEach((k, i) => {
      const c = ws.getCell(mulai, i + 1);
      c.value = k.header;
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
      ws.getColumn(i + 1).width = k.width ?? Math.max(12, k.header.length + 2);
      if (k.rupiah) ws.getColumn(i + 1).numFmt = '#,##0';
    });
    s.baris.forEach((b, r) => {
      s.kolom.forEach((k, i) => {
        const v = b[k.key];
        ws.getCell(mulai + 1 + r, i + 1).value = (v === undefined ? null : v) as ExcelJS.CellValue;
      });
    });
    if (s.kolom.some((k) => k.rupiah) && s.baris.length) {
      const r = mulai + 1 + s.baris.length;
      ws.getCell(r, 1).value = 'JUMLAH';
      ws.getCell(r, 1).font = { bold: true };
      s.kolom.forEach((k, i) => {
        if (!k.rupiah) return;
        const total = s.baris.reduce((a, b) => a + (Number(b[k.key]) || 0), 0);
        const c = ws.getCell(r, i + 1);
        c.value = total;
        c.font = { bold: true };
      });
    }
    ws.views = [{ state: 'frozen', ySplit: mulai }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
