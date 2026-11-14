import Link from 'next/link';

export default function TidakDitemukan() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm font-medium text-redup">404</p>
      <h1 className="text-lg font-semibold">Halaman atau data tidak ditemukan</h1>
      <p className="max-w-md text-sm text-redup">Data mungkin sudah dihapus atau berada di luar cakupan akun Anda.</p>
      <Link href="/dasbor" className="mt-2 text-sm font-medium text-utama hover:underline">
        Kembali ke dasbor
      </Link>
    </main>
  );
}
