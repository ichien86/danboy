import type { Metadata } from 'next';
import Link from 'next/link';
import { daftarMasterHibah, tahunAktifAtauNull } from '@danboy/core/services';
import type { JenisMasterHibah } from '@danboy/schema';
import { TabelMaster, TombolAksi, type KolomMaster } from '@/components/hibah';
import { Kartu, KepalaHalaman } from '@/components/ui';
import { halamanHibah, type Data, type SP } from '@/lib/hibah';

export const metadata: Metadata = { title: 'Master Hibah dan Bansos' };

const TAB: { jenis: JenisMasterHibah; label: string }[] = [
  { jenis: 'jenis-penerima', label: 'Jenis penerima' },
  { jenis: 'checklist', label: 'Checklist evaluasi' },
  { jenis: 'berkas-wajib', label: 'Berkas wajib' },
  { jenis: 'tujuan-bansos', label: 'Tujuan bansos' },
  { jenis: 'rekening', label: 'Rekening' },
  { jenis: 'susunan', label: 'Susunan TAPD' },
];

export default async function HalamanMaster({ searchParams }: { searchParams: SP }) {
  const { user, sp } = await halamanHibah('hibah_kelola_master', searchParams);
  const jenis = TAB.find((t) => t.jenis === sp.jenis)?.jenis ?? 'jenis-penerima';
  const jp = (await daftarMasterHibah(user, 'jenis-penerima')) as Data[];
  const opsiJenis = jp.map((j) => ({ nilai: j.kode as string, label: `${j.kode} ${j.nama}` }));
  const t = await tahunAktifAtauNull();
  const data = (await daftarMasterHibah(user, jenis, jenis === 'susunan' ? { tahun: t?.tahun } : {})) as Data[];
  const kelompok = [
    { nilai: 'hibah', label: 'Hibah' },
    { nilai: 'bansos', label: 'Bansos' },
  ];
  const KOLOM: Partial<Record<JenisMasterHibah, KolomMaster[]>> = {
    'jenis-penerima': [
      { key: 'kode', label: 'Kode', wajib: true, kunci: true },
      { key: 'nama', label: 'Nama', wajib: true },
      { key: 'kelompok', label: 'Kelompok', tipe: 'pilihan', opsi: kelompok, wajib: true },
      { key: 'bentuk', label: 'Bentuk diizinkan', tipe: 'multi', opsi: [{ nilai: 'uang', label: 'Uang' }, { nilai: 'barang', label: 'Barang' }] },
      {
        key: 'identitas',
        label: 'Identitas',
        tipe: 'pilihan',
        wajib: true,
        opsi: [
          { nilai: 'nik', label: 'NIK (KTP wajib)' },
          { nilai: 'nik_kk', label: 'NIK + KK' },
          { nilai: 'badan_hukum', label: 'Nomor badan hukum' },
          { nilai: 'lainnya', label: 'Lainnya' },
        ],
      },
      { key: 'bebasTerusMenerus', label: 'Dikecualikan dari larangan terus-menerus', tipe: 'bool', bawaan: false },
      { key: 'sekaliSetahun', label: 'Hanya 1 kali setahun (K/L)', tipe: 'bool', bawaan: false, tabel: false },
      { key: 'urutan', label: 'Urutan', tipe: 'angka', tabel: false },
      { key: 'aktif', label: 'Aktif', tipe: 'bool' },
    ],
    checklist: [
      { key: 'jenisPenerimaKode', label: 'Berlaku untuk', tipe: 'pilihan', wajib: true, opsi: [{ nilai: 'hibah', label: 'Semua hibah' }, { nilai: 'bansos', label: 'Semua bansos' }, ...opsiJenis] },
      { key: 'urutan', label: 'Urutan', tipe: 'angka' },
      { key: 'pertanyaan', label: 'Butir pertanyaan', wajib: true },
      { key: 'dasar', label: 'Dasar regulasi' },
      { key: 'wajib', label: 'Wajib dijawab', tipe: 'bool' },
      { key: 'butuhBerkas', label: 'Wajib disertai berkas', tipe: 'bool', bawaan: false, tabel: false },
      { key: 'aktif', label: 'Aktif', tipe: 'bool' },
    ],
    'berkas-wajib': [
      { key: 'jenisPenerimaKode', label: 'Jenis penerima', tipe: 'pilihan', wajib: true, opsi: [{ nilai: '*', label: 'Semua jenis' }, ...opsiJenis] },
      { key: 'kode', label: 'Kode', wajib: true, bantuan: 'huruf kecil, misalnya proposal, ktp, akta' },
      { key: 'nama', label: 'Nama berkas', wajib: true },
      { key: 'tingkat', label: 'Melekat pada', tipe: 'pilihan', wajib: true, opsi: [{ nilai: 'penerima', label: 'Kartu penerima' }, { nilai: 'usulan', label: 'Usulan' }] },
      { key: 'wajib', label: 'Wajib', tipe: 'bool' },
      { key: 'sensitif', label: 'Sensitif (KTP/KK)', tipe: 'bool', bawaan: false },
      { key: 'aktif', label: 'Aktif', tipe: 'bool' },
    ],
    'tujuan-bansos': [
      { key: 'kode', label: 'Kode', wajib: true },
      { key: 'nama', label: 'Nama', wajib: true },
      { key: 'aktif', label: 'Aktif', tipe: 'bool' },
    ],
    rekening: [
      { key: 'kodeRekening', label: 'Kode rekening', wajib: true, kunci: true, bantuan: '5.1.05 untuk hibah, 5.1.06 untuk bansos' },
      { key: 'nama', label: 'Nama' },
      { key: 'jenisPenerimaKode', label: 'Untuk jenis penerima (kosong = semua)', tipe: 'multi', opsi: opsiJenis },
      { key: 'aktif', label: 'Aktif', tipe: 'bool' },
    ],
    susunan: [
      { key: 'tahun', label: 'Tahun', tipe: 'angka', wajib: true, bawaan: t?.tahun },
      { key: 'urutan', label: 'Urutan', tipe: 'angka' },
      { key: 'nama', label: 'Nama', wajib: true },
      { key: 'nip', label: 'NIP' },
      { key: 'jabatanTapd', label: 'Jabatan dalam TAPD', wajib: true },
    ],
  };
  return (
    <>
      <KepalaHalaman
        judul="Master"
        sub="Perubahan butir checklist tidak mengubah evaluasi yang sudah tersimpan; butir yang diubah naik versi."
        aksi={jenis === 'rekening' ? <TombolAksi url="/api/hibah/master/tarik-rekening" label="Tarik rekening 5.1.05 dan 5.1.06 dari DANBOY" berhasil="Rekening diperbarui" kecil={false} /> : undefined}
      />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Jenis master">
        {TAB.map((x) => (
          <Link
            key={x.jenis}
            href={`?jenis=${x.jenis}`}
            aria-current={x.jenis === jenis ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${x.jenis === jenis ? 'bg-utama-lembut font-medium text-utama' : 'text-redup hover:bg-latar hover:text-teks'}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <Kartu padat>
        <TabelMaster jenis={jenis} judul={TAB.find((x) => x.jenis === jenis)!.label} kolom={KOLOM[jenis] ?? []} data={data} />
      </Kartu>
    </>
  );
}
