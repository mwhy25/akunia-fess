import { NextResponse } from 'next/server';
import { runDueScheduledPosts } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

// Cron untuk scheduler admin. Dipanggil oleh layanan eksternal (cron-job.org /
// GitHub Actions) via POST dengan header:
//   Authorization: Bearer <SCHEDULER_CRON_SECRET>
//
// Dipisah dari /api/cron/cleanup yang memakai CRON_SECRET, supaya kunci
// pembersih data bocor pun tidak bisa memicu antrian posting X.
//
// Hanya memproses antrian "tanpa kredit" (tabel scheduled_posts). Tidak
// memotong kredit user apa pun.
export async function POST(req: Request) {
  const secret = process.env.SCHEDULER_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SCHEDULER_CRON_SECRET belum di-set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Dilarang' }, { status: 401 });
  }

  const res = await runDueScheduledPosts('cron');
  return NextResponse.json({ ok: true, ...res });
}
