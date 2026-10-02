import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Dilarang' }, { status: 403 });

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return NextResponse.json({ results: [] });
  if (q.length > 50) return NextResponse.json({ error: 'Kata kunci terlalu panjang' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('username, credits')
    .ilike('username', `%${q}%`)
    .order('username', { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
