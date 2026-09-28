'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { rupiah } from '@/lib/utils';

const LINKS = [
  { href: '/dashboard', label: 'Beranda' },
  { href: '/create', label: 'Kirim' },
  { href: '/my-posts', label: 'Riwayat' },
  { href: '/credits', label: 'Kredit' },
  { href: '/profile', label: 'Akun' },
];

export function AppNav({ username, credits, isAdmin }: { username: string; credits: number; isAdmin: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const active = (h: string) => path === h || path.startsWith(h + '/');

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b-[3px] border-red bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-5">
          <Link href="/dashboard" className="display bg-red px-2.5 pb-1 pt-1.5 text-[22px] text-white">MENFESS</Link>
          <div className="flex items-center gap-3">
            <Link href="/credits" className="flex min-h-[40px] items-center border-[3px] border-acid px-3 text-sm font-black text-acid" aria-label={`${credits} kredit`}>
              {credits} <span className="ml-1 text-[10px] uppercase tracking-widest">kredit</span>
            </Link>
            <button onClick={logout} className="hidden min-h-[44px] text-xs font-black uppercase tracking-wider text-mute hover:text-ink sm:block">Keluar</button>
          </div>
        </div>
        {/* Nav desktop */}
        <nav className="mx-auto hidden max-w-3xl gap-1 px-5 sm:flex" aria-label="Utama">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`px-3 py-3 text-sm font-black uppercase tracking-wider ${active(l.href) ? 'border-b-[3px] border-acid text-acid' : 'text-mute hover:text-ink'}`}>{l.label}</Link>
          ))}
          {isAdmin && <Link href="/admin" className="ml-auto px-3 py-3 text-sm font-black uppercase tracking-wider text-red">Admin</Link>}
        </nav>
      </header>

      {/* Tab bar mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-[3px] border-ink bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Utama">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`flex min-h-[58px] items-center justify-center px-1 text-center text-[11px] font-black uppercase tracking-wide ${active(l.href) ? 'bg-acid text-black' : 'text-mute'}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
