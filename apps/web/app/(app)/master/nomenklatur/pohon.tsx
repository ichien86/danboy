'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cx } from '@/components/ui';
import { api } from '@/lib/klien';

interface Simpul {
  _id: string;
  kode: string;
  nama: string;
  jenis: string;
  jumlahAnak: number;
}

const LABEL: Record<string, string> = { urusan: 'Urusan', bidang: 'Bidang', program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Subkegiatan' };

function Cabang({ n, tingkat }: { n: Simpul; tingkat: number }) {
  const [buka, setBuka] = useState(false);
  const [anak, setAnak] = useState<Simpul[] | null>(null);
  const toggle = async () => {
    if (!buka && !anak) {
      const r = await api<{ data: Simpul[] }>(`/api/nomenklatur?induk=${encodeURIComponent(n.kode)}`);
      setAnak(r.data);
    }
    setBuka((b) => !b);
  };
  return (
    <li>
      <div className="flex items-center gap-1.5 border-b border-garis py-1.5 pr-4 hover:bg-latar/60" style={{ paddingLeft: `${0.75 + tingkat * 1.25}rem` }}>
        {n.jumlahAnak ? (
          <button type="button" onClick={toggle} aria-expanded={buka} aria-label={`${buka ? 'Tutup' : 'Buka'} ${n.nama}`} className="rounded p-0.5 text-redup hover:bg-latar">
            <ChevronRight className={cx('size-4 transition-transform', buka && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className="font-mono text-xs text-redup">{n.kode}</span>
        {n.jenis === 'subkegiatan' ? (
          <Link href={`/master/nomenklatur/${encodeURIComponent(n.kode)}`} className="text-sm hover:underline">
            {n.nama}
          </Link>
        ) : (
          <span className={cx('text-sm', tingkat < 2 && 'font-medium')}>{n.nama}</span>
        )}
        <span className="ml-auto hidden text-[11px] text-redup sm:inline">{LABEL[n.jenis]}</span>
      </div>
      {buka && anak && (
        <ul>
          {anak.map((a) => (
            <Cabang key={a._id} n={a} tingkat={tingkat + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PohonNomenklatur({ akar }: { akar: Simpul[] }) {
  return (
    <ul>
      {akar.map((n) => (
        <Cabang key={n._id} n={n} tingkat={0} />
      ))}
    </ul>
  );
}
