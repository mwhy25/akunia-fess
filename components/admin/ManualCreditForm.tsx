'use client';
import { useEffect, useRef, useState } from 'react';

type SearchResult = { username: string; credits: number };

export function ManualCreditForm() {
  const [usernamesRaw, setUsernamesRaw] = useState('');
  const [credits, setCredits] = useState('1');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // search state
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // debounce search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/accounts/search?q=${encodeURIComponent(term)}`);
        const j = await res.json().catch(() => ({}));
        if (res.ok) setHits(j.results ?? []);
        else setHits([]);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function addUsername(name: string) {
    const existing = usernamesRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const lower = new Set(existing.map((s) => s.toLowerCase()));
    if (lower.has(name.toLowerCase())) return;
    const next = existing.length ? `${existing.join(', ')}, ${name}` : name;
    setUsernamesRaw(next);
  }

  function removeUsername(name: string) {
    const parts = usernamesRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.toLowerCase() !== name.toLowerCase());
    setUsernamesRaw(parts.join(', '));
  }

  const selectedList = usernamesRaw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const selectedCount = selectedList.length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);

    const c = Number(credits);
    if (!Number.isInteger(c) || c < 1 || c > 10000) {
      setError('Jumlah kredit harus 1–10000');
      return;
    }
    if (!usernamesRaw.trim()) {
      setError('Isi minimal 1 username — cari di atas lalu klik hasilnya');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: usernamesRaw, credits: c, note: note || null }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(j.error || 'Gagal');
    setResult(j);
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-[3px] border-line bg-panel p-4">
      {/* SEARCH */}
      <div className="space-y-1.5">
        <label className="text-sm font-bold">Cari username</label>
        <div ref={wrapRef} className="relative">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => q.trim() && hits.length > 0 && setOpen(true)}
            placeholder="ketik username, mis. andi"
            className="w-full border-[3px] border-line bg-bg px-3 py-2 pr-10 text-sm outline-none focus:border-acid"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mute">
            {searching ? '…' : '⌕'}
          </span>

          {open && (hits.length > 0 || searching) && (
            <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto border-[3px] border-line bg-bg shadow-lg">
              {hits.map((r) => {
                const already = selectedList.some((s) => s.toLowerCase() === r.username.toLowerCase());
                return (
                  <li key={r.username}>
                    <button
                      type="button"
                      onClick={() => {
                        addUsername(r.username);
                        setOpen(false);
                      }}
                      disabled={already}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-acid/10 ${already ? 'opacity-40' : ''}`}
                    >
                      <span className="font-bold">{r.username}</span>
                      <span className="text-xs text-mute">
                        {already ? 'sudah dipilih' : `${r.credits} kredit`}
                      </span>
                    </button>
                  </li>
                );
              })}
              {searching && <li className="px-3 py-2 text-sm text-mute">Mencari...</li>}
              {!searching && hits.length === 0 && q.trim().length >= 1 && (
                <li className="px-3 py-2 text-sm text-mute">Tidak ada hasil</li>
              )}
            </ul>
          )}
        </div>
        <p className="text-xs text-mute">Klik hasil pencarian untuk menambah ke daftar di bawah.</p>
      </div>

      {/* TEXTAREA (terisi dari klik) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold">Daftar username terpilih</label>
          <span className="text-xs text-mute">{selectedCount} terpilih</span>
        </div>
        <textarea
          value={usernamesRaw}
          onChange={(e) => setUsernamesRaw(e.target.value)}
          placeholder="hasil klik akan muncul di sini — bisa edit manual, pisah koma/baris baru"
          rows={5}
          className="w-full border-[3px] border-line bg-bg px-3 py-2 text-sm outline-none focus:border-acid"
        />
        {selectedList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedList.map((name) => (
              <span
                key={name.toLowerCase()}
                className="inline-flex items-center gap-1.5 border-2 border-line bg-bg px-2 py-1 text-xs font-bold"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeUsername(name)}
                  className="rounded px-1 leading-none hover:bg-red/10"
                  aria-label={`Hapus ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setUsernamesRaw('')}
              className="text-xs font-bold text-mute underline underline-offset-4"
            >
              kosongkan
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-bold">Jumlah kredit per akun</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="w-full border-[3px] border-line bg-bg px-3 py-2 text-sm outline-none focus:border-acid"
          />
          <p className="text-xs text-mute">Nominal otomatis Rp0. Bebas 1–10000 kredit.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-bold">Catatan (opsional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="mis. bonus event, kompensasi, hadiah"
            className="w-full border-[3px] border-line bg-bg px-3 py-2 text-sm outline-none focus:border-acid"
          />
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn w-full sm:w-auto">
        {loading ? 'Memproses...' : `Tambah kredit${selectedCount ? ` ke ${selectedCount} akun` : ''}`}
      </button>

      {error && <p className="err text-sm">{error}</p>}

      {result && (
        <div className="space-y-3 border-t-[3px] border-line pt-4 text-sm">
          <p className="font-black">
            Selesai — berhasil {result.succeeded?.length ?? 0}, tidak ditemukan {result.notFound?.length ?? 0}, gagal{' '}
            {result.failed?.length ?? 0} ( +{result.creditsAdded} kredit/akun, Rp0 )
          </p>
          {result.succeeded?.length > 0 && (
            <div>
              <p className="font-bold text-acid">Berhasil:</p>
              <ul className="mt-1 list-disc pl-5">
                {result.succeeded.map((s: any) => (
                  <li key={s.username}>
                    {s.username}: {s.before} → {s.after}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.notFound?.length > 0 && (
            <div>
              <p className="font-bold text-red">Username tidak ditemukan:</p>
              <p className="break-all text-mute">{result.notFound.join(', ')}</p>
            </div>
          )}
          {result.failed?.length > 0 && (
            <div>
              <p className="font-bold text-red">Gagal:</p>
              <ul className="mt-1 list-disc pl-5">
                {result.failed.map((f: any) => (
                  <li key={f.username}>
                    {f.username}: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-mute">Tercatat di transaksi (type admin) dan order nominal Rp0.</p>
        </div>
      )}
    </form>
  );
}
