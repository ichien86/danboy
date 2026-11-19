import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

/*
 * Dokumen .docx modul Hibah dan Bansos (TDD bagian Dokumen .docx). Dokumen dibuat dengan mengisi templat Word
 * berkop surat; penanda isian ditulis {nama}, perulangan {#daftar}…{/daftar}. Bila PD atau Admin Perencana belum
 * mengunggah templat, dipakai templat bawaan yang dibangun di sini (OOXML minimal, tanpa berkas biner di repo).
 */

export type JenisTemplat = 'rekomendasi' | 'berita_acara' | 'lampiran';

/** Penanda yang wajib ada di templat unggahan. */
export const PENANDA_WAJIB: Record<JenisTemplat, string[]> = {
  rekomendasi: ['{nomor}', '{tanggal}', '{#usulan}', '{/usulan}'],
  berita_acara: ['{nomor}', '{tanggal}', '{#rekap}', '{/rekap}', '{#tapd}', '{/tapd}'],
  lampiran: ['{judul}', '{#baris}', '{/baris}'],
};

function dokumen(templat: Buffer) {
  return new Docxtemplater(new PizZip(templat), {
    paragraphLoop: true,
    linebreaks: true,
    // penanda tanpa data menjadi kosong, bukan "undefined"
    nullGetter: () => '',
  });
}

/** Isi templat dengan data; mengembalikan .docx. */
export function isiTemplat(templat: Buffer, data: Record<string, unknown>): Buffer {
  const d = dokumen(templat);
  d.render(data);
  return d.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Galat templat dalam bentuk daftar pesan (dari docxtemplater atau penanda wajib yang hilang). */
export function periksaTemplat(templat: Buffer, jenis: JenisTemplat, contoh: Record<string, unknown>): string[] {
  let teks: string;
  try {
    const d = dokumen(templat);
    teks = d.getFullText();
    d.render(contoh);
  } catch (e) {
    const g = e as { properties?: { errors?: { properties?: { explanation?: string; xtag?: string } }[]; explanation?: string }; message?: string };
    const daftar = g.properties?.errors?.map((x) => x.properties?.explanation ?? 'Penanda tidak valid') ?? [g.properties?.explanation ?? g.message ?? 'Berkas bukan .docx yang valid'];
    return daftar.slice(0, 20);
  }
  const rapat = teks.replace(/\s+/g, '');
  return PENANDA_WAJIB[jenis].filter((p) => !rapat.includes(p)).map((p) => `Penanda ${p} tidak ditemukan`);
}

/* ---------- Templat bawaan ---------- */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface GayaTeks { tebal?: boolean; tengah?: boolean; kanan?: boolean; ukuran?: number; garisBawah?: boolean; spasiSetelah?: number }
function run(t: string, g: GayaTeks = {}) {
  const rpr = `${g.tebal ? '<w:b/>' : ''}${g.ukuran ? `<w:sz w:val="${g.ukuran * 2}"/>` : ''}`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
}
function p(t: string | string[], g: GayaTeks = {}) {
  const jc = g.tengah ? '<w:jc w:val="center"/>' : g.kanan ? '<w:jc w:val="right"/>' : '';
  const bdr = g.garisBawah ? '<w:pBdr><w:bottom w:val="thick" w:sz="18" w:space="4" w:color="000000"/></w:pBdr>' : '';
  const sp = `<w:spacing w:after="${g.spasiSetelah ?? 80}"/>`;
  const isi = (Array.isArray(t) ? t : [t]).map((x) => run(x, g)).join('');
  return `<w:p><w:pPr>${bdr}${sp}${jc}</w:pPr>${isi}</w:p>`;
}
const hentiHalaman = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function sel(t: string, lebar: number, g: GayaTeks = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/></w:tcPr>${p(t, { ...g, spasiSetelah: 0, ukuran: g.ukuran ?? 10 })}</w:tc>`;
}
/** Tabel bergaris; `baris` boleh berisi penanda perulangan di sel pertama dan terakhir (perulangan baris). */
function tabel(lebar: number[], kepala: string[], baris: string[][], kaki?: string[]) {
  const garis = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="000000"/>`).join('');
  const tr = (sels: string[], g: GayaTeks = {}) =>
    `<w:tr>${sels.map((s, i) => sel(s, lebar[i], { ...g, kanan: g.kanan || /^\{(nilai|total|jumlah|harga)/i.test(s.replace(/^\{#\w+\}/, '')) })).join('')}</w:tr>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${lebar.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${garis}</w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${lebar.map((l) => `<w:gridCol w:w="${l}"/>`).join('')}</w:tblGrid>` +
    tr(kepala, { tebal: true, tengah: true }) +
    baris.map((b) => tr(b)).join('') +
    (kaki ? tr(kaki, { tebal: true }) : '') +
    '</w:tbl>'
  );
}

function bungkus(isi: string, mendatar = false) {
  const pg = mendatar ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const doc =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    isi +
    `<w:sectPr>${pg}<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>` +
    '</w:body></w:document>';
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file(
    'word/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>',
  );
  zip.file('word/document.xml', doc);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

const kop = (baris2: string) =>
  p('PEMERINTAH KABUPATEN BOYOLALI', { tebal: true, tengah: true, ukuran: 14, spasiSetelah: 0 }) +
  p(baris2, { tebal: true, tengah: true, ukuran: 16, spasiSetelah: 0 }) +
  p('{alamatKop}', { tengah: true, ukuran: 9, garisBawah: true, spasiSetelah: 240 });

function bawaanRekomendasi() {
  const ttd =
    p('Boyolali, {tanggal}', { kanan: true }) +
    p('KEPALA {namaPdKapital}', { kanan: true, tebal: true, spasiSetelah: 960 }) +
    p('{kepalaPdNama}', { kanan: true, tebal: true, spasiSetelah: 0 }) +
    p('NIP {kepalaPdNip}', { kanan: true });
  return bungkus(
    kop('{namaPdKapital}') +
      p('Nomor : {nomor}', { spasiSetelah: 0 }) +
      p('Perihal : {perihal}', { spasiSetelah: 240 }) +
      p('Yth. Bupati Boyolali melalui Ketua TAPD Kabupaten Boyolali', { spasiSetelah: 240 }) +
      p(
        'Berdasarkan hasil evaluasi atas usulan tertulis calon penerima hibah dan bantuan sosial Tahun Anggaran {tahun} sesuai Permendagri Nomor 17 Tahun 2026, bersama ini kami sampaikan rekomendasi sebagai berikut:',
      ) +
      tabel(
        [450, 1900, 1900, 1300, 800, 1700, 1300, 1300],
        ['No', 'Nama Penerima', 'Alamat', 'Jenis', 'Bentuk', 'Subkegiatan', 'Nilai Usulan (Rp)', 'Nilai Rekomendasi (Rp)'],
        [['{#usulan}{no}', '{nama}', '{alamat}', '{jenis}', '{bentuk}', '{subkegiatan}', '{nilaiUsulan}', '{nilaiRekomendasi}{/usulan}']],
        ['', 'JUMLAH', '', '', '', '', '{totalUsulan}', '{totalRekomendasi}'],
      ) +
      p('Rincian aktivitas setiap usulan terlampir. Demikian rekomendasi ini kami sampaikan.', { spasiSetelah: 360 }) +
      ttd +
      hentiHalaman +
      p('LAMPIRAN RINCIAN AKTIVITAS', { tebal: true, tengah: true }) +
      p('Nomor: {nomor}', { tengah: true, spasiSetelah: 240 }) +
      p('{#lampiran}') +
      p('{no}. {nama} ({nomorUsulan})', { tebal: true }) +
      tabel(
        [450, 3000, 900, 900, 1500, 1600, 1600],
        ['No', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Jumlah (Rp)', 'Rekomendasi (Rp)'],
        [['{#rincian}{no}', '{uraian}', '{volume}', '{satuan}', '{hargaSatuan}', '{jumlah}', '{nilaiRekomendasi}{/rincian}']],
        ['', 'JUMLAH', '', '', '', '{nilaiUsulan}', '{nilaiRekomendasiTotal}'],
      ) +
      p('{/lampiran}'),
  );
}

function bawaanBeritaAcara() {
  return bungkus(
    kop('TIM ANGGARAN PEMERINTAH DAERAH') +
      p('BERITA ACARA', { tebal: true, tengah: true, spasiSetelah: 0 }) +
      p('VERIFIKASI TAPD ATAS CALON PENERIMA HIBAH DAN BANTUAN SOSIAL', { tebal: true, tengah: true, spasiSetelah: 0 }) +
      p('TAHUN ANGGARAN {tahun}', { tebal: true, tengah: true, spasiSetelah: 0 }) +
      p('Nomor: {nomor}', { tengah: true, spasiSetelah: 240 }) +
      p('Pada hari ini {hariTanggal}, Tim Anggaran Pemerintah Daerah (TAPD) Kabupaten Boyolali telah melaksanakan verifikasi atas rekomendasi Perangkat Daerah terhadap usulan calon penerima hibah dan bantuan sosial Tahun Anggaran {tahun}.') +
      p('A. Dasar Hukum', { tebal: true }) +
      p('{#dasarHukum}{no}. {teks}{/dasarHukum}') +
      p('B. Kriteria Verifikasi', { tebal: true }) +
      p('1. Kesesuaian alokasi dengan tugas dan fungsi Perangkat Daerah;') +
      p('2. Kesesuaian program, kegiatan, dan subkegiatan dengan urusan dan kewenangan;') +
      p('3. Tidak terjadi duplikasi penganggaran dengan Perangkat Daerah lainnya;') +
      p('4. Kesesuaian dengan kemampuan keuangan daerah.') +
      p('C. Rekapitulasi', { tebal: true }) +
      tabel(
        [1800, 1300, 2000, 2000, 2000],
        ['Kelompok', 'Jumlah Usulan', 'Nilai Usulan (Rp)', 'Nilai Rekomendasi (Rp)', 'Nilai Disetujui (Rp)'],
        [['{#rekap}{kelompok}', '{jumlah}', '{nilaiUsulan}', '{nilaiRekomendasi}', '{nilaiDisetujui}{/rekap}']],
      ) +
      p('D. Kesimpulan', { tebal: true }) +
      p('Total nilai yang disetujui sebesar Rp{totalDisetujui} ({totalDisetujuiTerbilang}), dengan rincian sebagaimana tercantum dalam Lampiran I (hibah) dan Lampiran II (bantuan sosial) Berita Acara ini.', { spasiSetelah: 240 }) +
      p('Boyolali, {tanggal}', { kanan: true }) +
      p('TIM ANGGARAN PEMERINTAH DAERAH KABUPATEN BOYOLALI', { tebal: true, tengah: true }) +
      tabel([500, 3000, 2200, 2400, 1700], ['No', 'Nama', 'NIP', 'Jabatan dalam TAPD', 'Tanda Tangan'], [['{#tapd}{no}', '{nama}', '{nip}', '{jabatan}', '{/tapd}']]),
  );
}

function bawaanLampiran() {
  return bungkus(
    p('{judul}', { tebal: true, tengah: true, spasiSetelah: 0 }) +
      p('Berita Acara Verifikasi TAPD Tahun Anggaran {tahun} Nomor {nomorBa}', { tengah: true, spasiSetelah: 240 }) +
      tabel(
        [400, 1500, 1700, 1700, 1100, 700, 550, 550, 550, 550, 1000, 1300, 1300, 2000],
        ['No', 'Perangkat Daerah', 'Nama Penerima', 'Alamat', 'Jenis', 'Bentuk', 'A1', 'A2', 'A3', 'A4', 'Status', 'Rekomendasi (Rp)', 'Disetujui (Rp)', 'Alasan'],
        [['{#baris}{no}', '{pd}', '{nama}', '{alamat}', '{jenis}', '{bentuk}', '{aspek1}', '{aspek2}', '{aspek3}', '{aspek4}', '{status}', '{nilaiRekomendasi}', '{nilaiDisetujui}', '{alasan}{/baris}']],
        ['', 'JUMLAH', '', '', '', '', '', '', '', '', '', '{totalRekomendasi}', '{totalDisetujui}', ''],
      ) +
      p('A1 tugas dan fungsi PD · A2 program, kegiatan, subkegiatan · A3 tidak duplikasi · A4 kemampuan keuangan daerah · M = memenuhi, TM = tidak memenuhi', { ukuran: 8 }),
    true,
  );
}

const cacheBawaan = new Map<JenisTemplat, Buffer>();
export function templatBawaan(jenis: JenisTemplat): Buffer {
  let b = cacheBawaan.get(jenis);
  if (!b) {
    b = jenis === 'rekomendasi' ? bawaanRekomendasi() : jenis === 'berita_acara' ? bawaanBeritaAcara() : bawaanLampiran();
    cacheBawaan.set(jenis, b);
  }
  return b;
}

/** Teks polos isi .docx (untuk uji dan pemeriksaan). */
export function teksDocx(isi: Buffer): string {
  const xml = new PizZip(isi).file('word/document.xml')?.asText() ?? '';
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
