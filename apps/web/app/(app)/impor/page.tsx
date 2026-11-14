import { redirect } from 'next/navigation';

/** Menu Impor sudah dilebur ke halaman pengelolaan data masing-masing; tautan lama diarahkan ke Subkegiatan. */
export default function Impor() {
  redirect('/subkegiatan');
}
