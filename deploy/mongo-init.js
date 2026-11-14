// Dijalankan sekali saat volume MongoDB kosong: buat pengguna aplikasi dengan hak minimum.
// Hak per koleksi didaftar satu per satu, karena hak tingkat database (collection: '') akan ikut mencakup logAudit.
// Pada logAudit pengguna aplikasi hanya boleh baca dan tambah (log audit hanya-tambah).
const dbApp = db.getSiblingDB('danboy');

const KOLEKSI = [
  'skpd', 'subUnit', 'user', 'nomenklatur', 'rekening', 'sumberDana', 'tagging', 'tahunAnggaran', 'tahapan',
  'paguSumberDana', 'subkegiatanTahapan', 'imporBatch', 'imporBaris', 'hasilBanding', 'notifikasi',
  'unggahan.files', 'unggahan.chunks',
];
const BACA_TULIS = ['find', 'insert', 'update', 'remove', 'createIndex', 'dropIndex', 'createCollection', 'listIndexes', 'collStats'];

dbApp.createRole({
  role: 'danboyApp',
  privileges: [
    ...KOLEKSI.map((c) => ({ resource: { db: 'danboy', collection: c }, actions: BACA_TULIS })),
    { resource: { db: 'danboy', collection: 'logAudit' }, actions: ['find', 'insert', 'createIndex', 'listIndexes', 'createCollection', 'collStats'] },
    { resource: { db: 'danboy', collection: '' }, actions: ['listCollections', 'dbStats'] },
  ],
  roles: [],
});

dbApp.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'danboyApp', db: 'danboy' }],
});
