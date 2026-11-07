import { NextResponse } from 'next/server';
import { runDueScheduledPosts } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

// Cron untuk scheduler admin. Panggil berkala (mis. tiap 5 menit) dari
// Netlify scheduled function / cron-job.org dengan header:
//   Authorization: Bearer <CRON_SECRET>
//
// Hanya memproses antrian yang "tanpa kredit" ini (tabel scheduled_posts),
// jadi aman dipanggil terpisah dari cron cleanup. Tidak memotong kredit
// user apa pun.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET belum di-set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Dilarang' }, { status: 401 });
  }

  const res = await runDueScheduledPosts('cron');
  return NextResponse.json({ ok: true, ...res });
}
