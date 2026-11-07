'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { xlsxToImportRows } from '@/lib/scheduler/importer';

interface ScheduledPost {
  id: string;
  source_ref: string | null;
  text: string;
  photo_url: string | null;
  status: 'pending' | 'posted' | 'failed' | 'skipped';
  scheduled_at: string | null;
  posted_at: string | null;
  tweet_id: string | null;
  attempts: number;
  last_error: string | null;
  created_by: string | null;
}

interface LogRow {
  id: number;
  trigger: string;
  posted: number;
  failed: number;
  detail: string | null;
  run_at: string;
}

function timeAgo(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function SchedulerClient() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'queue' | 'import'>('queue');

  // Import form state
  const [perDay, setPerDay] = useState(10);
  const [winStart, setWinStart] = useState('09:00');
  const [winEnd, setWinEnd] = useState('22:00');
  const [order, setOrder] = useState<'oldest-first' | 'newest-first'>('oldest-first');
  const [preview, setPreview] = useState<{ rows: any[]; sheet: string; count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/scheduler', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionMsg({ ok: false, text: j.error || 'Gagal memuat' });
      return;
    }
    setPosts(j.posts ?? []);
    setLogs(j.logs ?? []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Counts
  const counts = useMemo(() => {
    const c = { pending: 0, posted: 0, failed: 0, skipped: 0 };
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  async function doAction(body: Record<string, unknown>) {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg({ ok: false, text: j.error || `HTTP ${res.status}` });
      } else {
        const summary =
          body.action === 'import'
            ? `Impor ${j.imported} post`
            : body.action === 'run'
            ? `Jalan: ${j.posted} posted, ${j.failed} gagal`
            : body.action === 'post-now'
            ? j.ok
              ? `Tayang: ${j.tweetId}`
              : `Gagal: ${j.error}`
            : body.action === 'clear-failed'
            ? `Hapus ${j.removed} item failed/skipped`
            : body.action === 'retry-failed'
            ? `Reset ${j.retried} item failed`
            : 'OK';
        setActionMsg({ ok: true, text: summary });
        await refresh();
      }
    } catch (e: any) {
      setActionMsg({ ok: false, text: e.message || 'Error jaringan' });
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: 'array' });
      const sheets: Record<string, any[][]> = {};
      for (const name of wb.SheetNames) {
        sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false });
      }
      const out = xlsxToImportRows(sheets, {
        perDay,
        window: [winStart, winEnd],
        order,
      });
      setPreview({ rows: out.rows, sheet: out.sheetName, count: out.items ?? 0 });
    };
    reader.readAsArrayBuffer(file);
  }

  async function confirmImport() {
    if (!preview?.rows?.length) return;
    await doAction({ action: 'import', rows: preview.rows });
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    setTab('queue');
  }

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('queue')}
            className={`btn btn-sm ${tab === 'queue' ? '' : 'btn-ghost'}`}
          >
            Antrean ({posts.length})
          </button>
          <button
            onClick={() => setTab('import')}
            className={`btn btn-sm ${tab === 'import' ? '' : 'btn-ghost'}`}
          >
            Impor xlsx
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-sm" disabled={busy || counts.pending === 0} onClick={() => doAction({ action: 'run' })}>
            {busy ? 'Proses...' : `Jalan due (${counts.pending})`}
          </button>
          <button className="btn btn-sm btn-ghost" disabled={busy || counts.failed === 0} onClick={() => doAction({ action: 'retry-failed' })}>
            Retry failed ({counts.failed})
          </button>
          <button className="btn btn-sm btn-ghost" disabled={busy || counts.failed + counts.skipped === 0} onClick={() => doAction({ action: 'clear-failed' })}>
            Bersihkan
          </button>
          <button className="btn btn-sm btn-ghost" onClick={refresh}>
            ↻ Muat ulang
          </button>
        </div>
      </div>

      {actionMsg && (
        <p className={`border-l-4 p-3 text-sm ${actionMsg.ok ? 'border-acid bg-acid/10' : 'border-red bg-red-deep/40'}`} role="alert">
          {actionMsg.text}
        </p>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['pending', 'posted', 'failed', 'skipped'] as const).map((s) => (
          <div key={s} className={`border-[3px] p-3 ${s === 'pending' ? 'border-acid bg-acid/10' : 'border-line bg-panel'}`}>
            <p className="display text-4xl">{counts[s] ?? 0}</p>
            <p className="text-xs uppercase text-mute">{s}</p>
          </div>
        ))}
      </div>

      {/* IMPORT tab */}
      {tab === 'import' && (
        <div className="space-y-5 border-[3px] border-line bg-panel p-5">
          <h2 className="display text-2xl">Impor antrian dari xlsx</h2>
          <p className="text-sm text-mute">
            Upload file <b>index.xlsx</b> (sheet &quot;Posts&quot;). Kolom yang dibaca:
            <span className="ml-1 font-mono text-xs">post_id, text, photo_url, date, author</span>.
            Jadwal otomatis dibuat dari setting di bawah.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-sm">
              <span className="label">Per hari</span>
              <input className="field" type="number" min={1} max={50} value={perDay} onChange={(e) => setPerDay(Number(e.target.value) || 1)} />
            </label>
            <label className="text-sm">
              <span className="label">Mulai</span>
              <input className="field" type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="label">Selesai</span>
              <input className="field" type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="label">Urutan</span>
              <select className="field" value={order} onChange={(e) => setOrder(e.target.value as any)}>
                <option value="oldest-first">Terlama dulu</option>
                <option value="newest-first">Terbaru dulu</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="text-sm"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            {preview && (
              <span className="text-sm text-mute">
                Sheet <b>{preview.sheet}</b> · {preview.count} post siap dijadwalkan
              </span>
            )}
          </div>

          {preview && (
            <div className="border-[3px] border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold">Pratinjau {preview.rows.length} post</p>
                <button className="btn" onClick={confirmImport} disabled={busy}>
                  {busy ? 'Mengimpor...' : `Impor ${preview.rows.length}`}
                </button>
              </div>
              <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                {preview.rows.slice(0, 10).map((r, i) => (
                  <li key={i} className="border-b border-line pb-2">
                    <span className="mr-2 text-mute">#{i + 1}</span>
                    <span className="font-mono text-xs">{r.scheduled_at?.slice(0, 16).replace('T', ' ')}</span>
                    <span className="ml-2 break-words text-mute">{r.text.slice(0, 60)}…</span>
                    {r.photo_url && <span className="ml-2 text-acid">📷</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* QUEUE tab */}
      {tab === 'queue' && (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className={`border-[3px] p-4 ${p.status === 'pending' ? 'border-acid bg-acid/5' : p.status === 'failed' ? 'border-red bg-red-deep/20' : 'border-line bg-panel'}`}>
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`badge ${p.status === 'pending' ? 'text-acid' : p.status === 'posted' ? 'text-mute' : 'text-red'}`}>{p.status}</span>
                  {p.scheduled_at && <span className="text-mute">jadwal {new Date(p.scheduled_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                  {p.attempts > 0 && <span className="text-mute">{p.attempts}x coba</span>}
                </div>
                <span className="text-mute">{timeAgo(p.scheduled_at ?? p.posted_at)}</span>
              </div>

              <p className="mb-2 whitespace-pre-wrap break-words text-sm">{p.text}</p>

              {p.photo_url && (
                <a href={p.photo_url} target="_blank" rel="noopener noreferrer" className="mb-2 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo_url} alt="Foto post" className="max-h-40 border-[3px] border-line object-cover" />
                </a>
              )}

              {p.status === 'posted' && p.tweet_id && (
                <a className="text-sm font-bold text-acid underline" href={`https://x.com/i/web/status/${p.tweet_id}`} target="_blank" rel="noopener noreferrer">
                  Lihat di X →
                </a>
              )}
              {p.last_error && p.status !== 'posted' && (
                <p className="mt-2 text-xs text-red">{p.last_error}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {p.status === 'pending' && (
                  <>
                    <button className="btn btn-sm" disabled={busy} onClick={() => doAction({ action: 'post-now', id: p.id })}>
                      Post sekarang
                    </button>
                    <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => doAction({ action: 'skip', id: p.id })}>
                      Skip
                    </button>
                  </>
                )}
                {p.status === 'failed' && (
                  <button className="btn btn-sm" disabled={busy} onClick={() => doAction({ action: 'retry-failed' })}>
                    Retry
                  </button>
                )}
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => doAction({ action: 'delete', id: p.id })}>
                  Hapus
                </button>
              </div>
            </li>
          ))}
          {!posts.length && <p className="text-mute">Belum ada post terjadwal. Klik &quot;Impor xlsx&quot; untuk mulai.</p>}
        </ul>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="border-t-[3px] border-line pt-5">
          <h3 className="display mb-3 text-lg">Riwayat eksekusi</h3>
          <ul className="space-y-1 text-xs text-mute">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="font-mono">{new Date(l.run_at).toLocaleString('id-ID')}</span>
                <span className="badge">{l.trigger}</span>
                <span>+{l.posted} ✓ · {l.failed} ✗</span>
                {l.detail && <span className="truncate">— {l.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
