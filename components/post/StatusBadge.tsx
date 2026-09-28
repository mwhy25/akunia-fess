const MAP: Record<string, { label: string; cls: string }> = {
  queued: { label: 'Antre', cls: 'bg-acid text-black' },
  published: { label: 'Tayang', cls: 'bg-ink text-black' },
  rejected: { label: 'Ditolak', cls: 'bg-red text-white' },
  deleted: { label: 'Dihapus', cls: 'bg-line text-mute' },
  pending: { label: 'Menunggu', cls: 'bg-acid text-black' },
  paid: { label: 'Lunas', cls: 'bg-ink text-black' },
  expired: { label: 'Kedaluwarsa', cls: 'bg-line text-mute' },
  failed: { label: 'Gagal', cls: 'bg-red text-white' },
  refunded: { label: 'Refund', cls: 'bg-line text-mute' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, cls: 'bg-line text-mute' };
  return <span className={`inline-block px-2 py-1 text-[11px] font-black uppercase tracking-widest ${s.cls}`}>{s.label}</span>;
}
