import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED = ['/dashboard', '/create', '/my-posts', '/credits', '/profile', '/admin'];

const matches = (path: string, base: string) => path === base || path.startsWith(base + '/');

export async function middleware(req: NextRequest) {
  const { res, user } = await updateSession(req);
  const path = req.nextUrl.pathname;

  // Belum login tapi buka halaman terlindungi → balik ke landing (auth modal).
  if (!user && PROTECTED.some((p) => matches(path, p))) {
    const url = new URL('/', req.url);
    url.searchParams.set('auth', 'login');
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Cek role admin dilakukan di requireAdmin() pada layout admin, bukan di sini.
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/payment/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
