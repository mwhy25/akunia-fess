import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/create', '/my-posts', '/credits', '/profile', '/admin'];
const matches = (path: string, base: string) => path === base || path.startsWith(base + '/');

// Hanya gerbang cepat: cek cookie ada. Validasi sesi yang sebenarnya dilakukan
// di requireUser()/requireAdmin() pada layout, karena middleware (edge) tidak boleh query DB.
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasCookie = !!req.cookies.get('mf_session')?.value;

  if (!hasCookie && PROTECTED.some((p) => matches(path, p))) {
    const url = new URL('/', req.url);
    url.searchParams.set('auth', 'login');
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
