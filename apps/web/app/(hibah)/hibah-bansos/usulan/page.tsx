import type { Metadata } from 'next';
import type { SP } from '@/lib/hibah';
import { DaftarUsulanHalaman } from './daftar';

export const metadata: Metadata = { title: 'Usulan' };

export default async function HalamanUsulan({ searchParams }: { searchParams: SP }) {
  return <DaftarUsulanHalaman searchParams={searchParams} judul="Usulan" sub="Usulan hibah dan bansos" dasar="/hibah-bansos/usulan" />;
}
