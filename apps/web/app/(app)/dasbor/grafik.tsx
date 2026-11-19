'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rp } from '@/lib/klien';

const sumbu = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n);

export function GrafikPagu({ data }: { data: { nama: string; pagu: number; terpakai: number; melebihi: boolean }[] }) {
  return (
    <div className="h-80 w-full" role="img" aria-label="Grafik batang pagu dan terpakai per sumber dana">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke="rgb(var(--garis))" />
          <XAxis type="number" tickFormatter={sumbu} tick={{ fontSize: 11, fill: 'rgb(var(--redup))' }} stroke="rgb(var(--garis))" />
          <YAxis
            type="category"
            dataKey="nama"
            width={150}
            tick={{ fontSize: 11, fill: 'rgb(var(--teks))' }}
            tickFormatter={(s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)}
            stroke="rgb(var(--garis))"
          />
          <Tooltip
            formatter={(v: number, k: string) => [rp(v), k === 'pagu' ? 'Pagu' : 'Terpakai']}
            contentStyle={{ background: 'rgb(var(--permukaan))', border: '1px solid rgb(var(--garis))', borderRadius: 6, fontSize: 12 }}
            cursor={{ fill: 'rgb(var(--latar))' }}
          />
          <Legend formatter={(k: string) => (k === 'pagu' ? 'Pagu' : 'Terpakai')} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="pagu" fill="rgb(var(--garis))" radius={[0, 3, 3, 0]} />
          <Bar dataKey="terpakai" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.melebihi ? 'rgb(var(--bahaya))' : 'rgb(var(--utama))'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
