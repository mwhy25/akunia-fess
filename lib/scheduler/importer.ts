export function xlsxToImportRows(
  sheets: Record<string, any[][]>,
  options: { perDay?: number; window?: [string, string]; order?: 'oldest-first' | 'newest-first' } = {}
) {
  // Ambil sheet "Posts" kalau ada, selain itu sheet pertama.
  const sheetName = Object.keys(sheets).find((k) => k.toLowerCase().includes('post')) ?? Object.keys(sheets)[0];
  const rows = sheets[sheetName];
  if (!rows?.length) return { rows: [] as ImportRow[], sheetName };

  // Baris pertama = header. Map kolom.
  const header: Record<string, number> = {};
  rows[0]?.forEach((h, i) => {
    const key = String(h ?? '').trim().toLowerCase();
    header[key] = i;
  });

  const col = (name: string) => header[name];
  const has = (name: string) => header[name] !== undefined;

  type ImportRow = {
    source_ref?: string | null;
    text: string;
    photo_url?: string | null;
    scheduled_at?: string | null;
    meta?: Record<string, unknown>;
  };

  const items: ImportRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === '')) continue;

    const get = (name: string) => (has(name) ? row[header[name]] : undefined);

    const text = String(get('text') ?? get('content') ?? '').trim();
    if (!text) continue;

    const sourceRef = String(get('post_id') ?? get('source_id') ?? get('url') ?? '').trim() || null;
    const photo = String(get('photo_url') ?? get('photo_urls') ?? get('photo') ?? '').trim() || null;
    const date = String(get('date') ?? get('created_at') ?? get('source_created_at') ?? '').trim();
    const author = String(get('author') ?? get('username') ?? '').trim();

    items.push({
      source_ref: sourceRef,
      text,
      photo_url: photo,
      scheduled_at: null, // diisi oleh caller setelah hitung jadwal
      meta: { author: author || null, source_date: date || null, sheet: sheetName },
    });
  }

  // ---- Jadwalkan: spread ke window harian dengan per_day ----
  const perDay = options.perDay ?? 10;
  const [startStr, endStr] = options.window ?? ['09:00', '22:00'];
  const order = options.order ?? 'oldest-first';

  // Sort berdasarkan source_date (oldest-first default) kalau ada.
  const sorted = [...items].sort((a, b) => {
    const ad = a.meta?.source_date ? String(a.meta.source_date) : '9999-99-99';
    const bd = b.meta?.source_date ? String(b.meta.source_date) : '9999-99-99';
    const cmp = ad.localeCompare(bd);
    return order === 'oldest-first' ? cmp : -cmp;
  });

  // Ambil tanggal awal = hari ini (lokal). Spread per_day/hari.
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  const startMin = parseHM(startStr);
  const endMin = parseHM(endStr);
  const slotSpan = Math.max(1, endMin - startMin);

  const scheduled: ImportRow[] = sorted.map((item, i) => {
    const dayOffset = Math.floor(i / perDay);
    const indexInDay = i % perDay;
    const slot = slotSpan / Math.max(1, perDay);
    const minutesFromStart = startMin + slot * indexInDay;
    const absMinutes = minutesFromStart % (24 * 60);

    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(Math.floor(absMinutes / 60), absMinutes % 60, 0, 0);

    return { ...item, scheduled_at: d.toISOString() };
  });

  return { rows: scheduled, sheetName, items: sorted.length };
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}
