'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { KODE_ASPEK, LABEL_ASPEK } from '@danboy/core/hibah';
import { useToast } from '@/components/klien';
import { AreaTeks, Masukan, Peringatan, Tabel, TD, TH, Tombol, cx } from '@/components/ui';
import { api, bacaAngka, GalatApi, pesanGalat, rp, tulisAngka } from '@/lib/klien';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function PilihanYaTidak<T extends string>({ nama, nilai, opsi, onUbah }: { nama: string; nilai: T | null; opsi: { nilai: T; label: string; nada?: string }[]; onUbah: (v: T) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={nama}>
      {opsi.map((o) => (
        <button
          key={o.nilai}
          type="button"
          role="radio"
          aria-checked={nilai === o.nilai}
          onClick={() => onUbah(o.nilai)}
          className={cx('rounded-md border px-2.5 py-1 text-xs', nilai === o.nilai ? `${o.nada ?? 'border-utama bg-utama-lembut text-utama'} font-medium` : 'border-garis text-redup hover:bg-latar')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Evaluasi PD (FR-21–24): checklist, nilai rekomendasi per rincian, catatan setiap peringatan, kesimpulan. */
export function FormEvaluasi({ u }: { u: Data }) {
  const [checklist, setChecklist] = useState<Data[]>(u.evaluasi.checklist.map((b: Data) => ({ ...b })));
  const [rincian, setRincian] = useState<Data[]>(u.rincian.map((r: Data) => ({ _id: r._id, uraian: r.uraian, jumlah: r.jumlah, nilaiRekomendasi: r.nilaiRekomendasi ?? r.jumlah, catatanRekomendasi: r.catatanRekomendasi ?? '' })));
  const [peringatan, setPeringatan] = useState<Data[]>(u.peringatan.map((p: Data) => ({ ...p })));
  const [catatan, setCatatan] = useState(u.evaluasi.catatan ?? '');
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const totalRekom = rincian.reduce((a, r) => a + (r.nilaiRekomendasi ?? 0), 0);
  const perbaikan = u.status === 'perbaikan';

  async function simpan(): Promise<Data> {
    return api<Data>(`/api/hibah/usulan/${u._id}/evaluasi`, {
      method: 'PUT',
      body: {
        updatedAt: u.updatedAt,
        checklist: checklist.map((b) => ({ butirId: b.butirId, jawaban: b.jawaban, catatan: b.catatan ?? '' })),
        rincian: rincian.map((r) => ({ _id: r._id, nilaiRekomendasi: r.nilaiRekomendasi, catatanRekomendasi: r.catatanRekomendasi })),
        peringatan: peringatan.map((p) => ({ kode: p.kode, catatanOperator: p.catatanOperator ?? '' })),
        catatan,
      },
    });
  }
  async function jalankan(aksi: 'simpan' | 'layak' | 'tidak_layak') {
    setMemuat(aksi);
    setGalat({});
    setUmum('');
    try {
      const d = await simpan();
      if (aksi !== 'simpan' && d.status === 'evaluasi') {
        await api(`/api/hibah/usulan/${u._id}/kesimpulan`, { body: { updatedAt: d.updatedAt, kesimpulan: aksi } });
        toast(aksi === 'layak' ? 'Usulan dinyatakan Layak' : 'Usulan dinyatakan Tidak Layak');
      } else toast(d.status === 'evaluasi' && perbaikan ? 'Nilai rekomendasi berubah: usulan kembali ke evaluasi dan perlu dokumen rekomendasi baru' : 'Evaluasi disimpan');
      router.refresh();
    } catch (err) {
      if (err instanceof GalatApi && err.detail) setGalat(err.detail);
      setUmum(pesanGalat(err));
      router.refresh();
    } finally {
      setMemuat(null);
    }
  }

  return (
    <div className="space-y-5">
      {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
      {perbaikan && (
        <Peringatan nada="waspada" judul="Perbaikan dari TAPD">
          {u.verifikasi?.alasan}. Bila hanya berkas atau data lain yang diperbaiki, kirim ulang langsung ke TAPD. Bila nilai rekomendasi diubah, usulan kembali ke evaluasi dan harus masuk dokumen rekomendasi baru.
        </Peringatan>
      )}
      {peringatan.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Peringatan otomatis {galat.peringatan && <span className="font-normal text-bahaya">· {galat.peringatan}</span>}</h3>
          {peringatan.map((p, i) => (
            <div key={p.kode} className="rounded-md border border-waspada/40 bg-waspada/5 p-3">
              <p className="text-sm font-medium">{p.pesan}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-redup">
                {p.sumber.map((s: Data) => (
                  <li key={`${s.jenis}-${s.id}`}>{s.label}</li>
                ))}
              </ul>
              <AreaTeks
                className="mt-2"
                rows={2}
                value={p.catatanOperator ?? ''}
                onChange={(e) => setPeringatan((x) => x.map((y, n) => (n === i ? { ...y, catatanOperator: e.target.value } : y)))}
                placeholder="Catatan operator atas peringatan ini (wajib)"
                aria-label={`Catatan peringatan ${p.kode}`}
              />
            </div>
          ))}
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Checklist evaluasi {galat.checklist && <span className="font-normal text-bahaya">· {galat.checklist}</span>}</h3>
        <ol className="divide-y divide-garis rounded-md border border-garis">
          {checklist.map((b, i) => (
            <li key={b.butirId} className="grid gap-2 p-3 md:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm">
                  {i + 1}. {b.pertanyaan} {b.wajib && <span className="text-bahaya">*</span>}
                </p>
                {b.dasar && <p className="text-xs text-redup">Dasar: Permendagri 17/2026 butir {b.dasar}</p>}
                <Masukan
                  className="mt-1 h-8 text-xs"
                  value={b.catatan ?? ''}
                  onChange={(e) => setChecklist((x) => x.map((y, n) => (n === i ? { ...y, catatan: e.target.value } : y)))}
                  placeholder="Catatan (opsional)"
                  aria-label={`Catatan butir ${i + 1}`}
                />
              </div>
              <PilihanYaTidak
                nama={`Jawaban butir ${i + 1}`}
                nilai={b.jawaban}
                opsi={[
                  { nilai: 'ya', label: 'Ya', nada: 'border-aman bg-aman/10 text-aman' },
                  { nilai: 'tidak', label: 'Tidak', nada: 'border-bahaya bg-bahaya/10 text-bahaya' },
                ]}
                onUbah={(v) => setChecklist((x) => x.map((y, n) => (n === i ? { ...y, jawaban: v } : y)))}
              />
            </li>
          ))}
          {!checklist.length && <li className="p-3 text-sm text-redup">Tidak ada butir checklist untuk jenis penerima ini.</li>}
        </ol>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Nilai rekomendasi per rincian {galat.rincian && <span className="font-normal text-bahaya">· {galat.rincian}</span>}</h3>
        <div className="overflow-x-auto rounded-md border border-garis">
          <Tabel>
            <thead>
              <tr>
                <TH>Uraian</TH>
                <TH kanan>Nilai usulan</TH>
                <TH kanan>Rekomendasi</TH>
                <TH>Catatan</TH>
              </tr>
            </thead>
            <tbody>
              {rincian.map((r, i) => (
                <tr key={r._id}>
                  <TD>{r.uraian}</TD>
                  <TD kanan className="whitespace-nowrap">
                    {rp(r.jumlah)}
                  </TD>
                  <TD kanan>
                    <Masukan
                      className={cx('w-36 text-right', (r.nilaiRekomendasi ?? 0) > r.jumlah && 'border-bahaya')}
                      inputMode="numeric"
                      value={tulisAngka(r.nilaiRekomendasi)}
                      onChange={(e) => setRincian((x) => x.map((y, n) => (n === i ? { ...y, nilaiRekomendasi: bacaAngka(e.target.value) } : y)))}
                      aria-label={`Rekomendasi ${r.uraian}`}
                    />
                    {galat[`rincian.${i}`] && <p className="text-xs text-bahaya">{galat[`rincian.${i}`]}</p>}
                  </TD>
                  <TD>
                    <Masukan className="min-w-40" value={r.catatanRekomendasi} onChange={(e) => setRincian((x) => x.map((y, n) => (n === i ? { ...y, catatanRekomendasi: e.target.value } : y)))} aria-label={`Catatan rekomendasi ${r.uraian}`} />
                  </TD>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <TD className="font-medium">Jumlah</TD>
                <TD kanan className="whitespace-nowrap font-medium">
                  {rp(u.nilaiUsulan)}
                </TD>
                <TD kanan className="whitespace-nowrap font-semibold">
                  {rp(totalRekom)}
                </TD>
                <TD />
              </tr>
            </tfoot>
          </Tabel>
        </div>
        <p className="mt-1 text-xs text-redup">Nilai rekomendasi per rincian tidak boleh melebihi nilai usulan rincian itu.</p>
      </section>
      <AreaTeks rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan evaluasi" aria-label="Catatan evaluasi" />
      <div className="flex flex-wrap justify-end gap-2">
        <Tombol onClick={() => jalankan('simpan')} memuat={memuat === 'simpan'}>
          Simpan
        </Tombol>
        {u.status === 'evaluasi' && (
          <>
            <Tombol varian="bahaya" onClick={() => confirm('Nyatakan usulan Tidak Layak? Usulan berhenti di PD.') && jalankan('tidak_layak')} memuat={memuat === 'tidak_layak'}>
              Simpan dan nyatakan Tidak Layak
            </Tombol>
            <Tombol varian="utama" onClick={() => jalankan('layak')} memuat={memuat === 'layak'}>
              Simpan dan nyatakan Layak
            </Tombol>
          </>
        )}
      </div>
    </div>
  );
}

/** Verifikasi TAPD (FR-31–34): empat aspek, keputusan, nilai disetujui, alasan. */
export function FormVerifikasi({ u }: { u: Data }) {
  const [aspek, setAspek] = useState<Data[]>(KODE_ASPEK.map((k) => ({ kode: k, memenuhi: null, catatan: '', ...(u.verifikasi?.aspek?.find((a: Data) => a.kode === k) ?? {}) })));
  const [keputusan, setKeputusan] = useState<'disetujui' | 'ditolak' | 'perbaikan' | null>(u.verifikasi?.keputusan ?? null);
  const [nilai, setNilai] = useState<number | null>(u.verifikasi?.nilaiDisetujui ?? u.nilaiRekomendasi);
  const [alasan, setAlasan] = useState(u.verifikasi?.alasan ?? '');
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState('');
  const [memuat, setMemuat] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const nilaiBerlaku = keputusan === 'ditolak' ? 0 : nilai;
  const alasanWajib = keputusan === 'ditolak' || keputusan === 'perbaikan' || (keputusan === 'disetujui' && nilaiBerlaku !== u.nilaiRekomendasi);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!keputusan) return setUmum('Pilih keputusan');
        setMemuat(true);
        setGalat({});
        setUmum('');
        try {
          await api(`/api/hibah/usulan/${u._id}/verifikasi`, {
            method: 'PUT',
            body: { updatedAt: u.updatedAt, aspek: aspek.map((a) => ({ kode: a.kode, memenuhi: a.memenuhi, catatan: a.catatan ?? '' })), keputusan, nilaiDisetujui: keputusan === 'perbaikan' ? null : nilaiBerlaku, alasan },
          });
          toast('Verifikasi disimpan');
          router.refresh();
        } catch (err) {
          if (err instanceof GalatApi && err.detail) setGalat(err.detail);
          setUmum(pesanGalat(err));
        } finally {
          setMemuat(false);
        }
      }}
    >
      {umum && <Peringatan nada="bahaya">{umum}</Peringatan>}
      <ol className="divide-y divide-garis rounded-md border border-garis">
        {aspek.map((a, i) => (
          <li key={a.kode} className="grid gap-2 p-3 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-medium">
                {i + 1}. {LABEL_ASPEK[a.kode as keyof typeof LABEL_ASPEK]}
              </p>
              <Masukan className="mt-1 h-8 text-xs" value={a.catatan ?? ''} onChange={(e) => setAspek((x) => x.map((y, n) => (n === i ? { ...y, catatan: e.target.value } : y)))} placeholder="Catatan" aria-label={`Catatan aspek ${i + 1}`} />
            </div>
            <PilihanYaTidak
              nama={`Aspek ${i + 1}`}
              nilai={a.memenuhi === true ? 'm' : a.memenuhi === false ? 'tm' : null}
              opsi={[
                { nilai: 'm', label: 'Memenuhi', nada: 'border-aman bg-aman/10 text-aman' },
                { nilai: 'tm', label: 'Tidak memenuhi', nada: 'border-bahaya bg-bahaya/10 text-bahaya' },
              ]}
              onUbah={(v) => setAspek((x) => x.map((y, n) => (n === i ? { ...y, memenuhi: v === 'm' } : y)))}
            />
          </li>
        ))}
      </ol>
      {galat.aspek && <p className="text-xs text-bahaya">{galat.aspek}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-medium">Keputusan</p>
          <PilihanYaTidak
            nama="Keputusan"
            nilai={keputusan}
            opsi={[
              { nilai: 'disetujui', label: 'Disetujui', nada: 'border-aman bg-aman/10 text-aman' },
              { nilai: 'perbaikan', label: 'Perbaikan', nada: 'border-waspada bg-waspada/10 text-waspada' },
              { nilai: 'ditolak', label: 'Ditolak', nada: 'border-bahaya bg-bahaya/10 text-bahaya' },
            ]}
            onUbah={setKeputusan}
          />
        </div>
        <div>
          <label htmlFor="v-nilai" className="mb-1 block text-sm font-medium">
            Nilai disetujui <span className="font-normal text-redup">(rekomendasi PD {rp(u.nilaiRekomendasi)})</span>
          </label>
          <Masukan
            id="v-nilai"
            inputMode="numeric"
            className="text-right"
            disabled={keputusan === 'ditolak' || keputusan === 'perbaikan'}
            value={keputusan === 'perbaikan' ? '' : tulisAngka(nilaiBerlaku)}
            onChange={(e) => setNilai(bacaAngka(e.target.value))}
          />
          {galat.nilaiDisetujui && <p className="text-xs text-bahaya">{galat.nilaiDisetujui}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="v-alasan" className="mb-1 block text-sm font-medium">
          Alasan {alasanWajib && <span className="text-bahaya">(wajib)</span>}
        </label>
        <AreaTeks id="v-alasan" rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
        {galat.alasan && <p className="text-xs text-bahaya">{galat.alasan}</p>}
      </div>
      <div className="flex justify-end">
        <Tombol type="submit" varian="utama" memuat={memuat}>
          Simpan verifikasi
        </Tombol>
      </div>
    </form>
  );
}
