import Link from 'next/link';

export function AdminNav() {
  return (
    <header className="border-b-[3px] border-red bg-bg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-5">
        <span className="display bg-red px-2.5 pb-1 pt-1.5 text-[22px] text-white">ADMIN</span>
        <nav className="flex gap-1 text-xs font-black uppercase tracking-wider" aria-label="Admin">
          <Link href="/admin" className="flex min-h-[44px] items-center px-2">Ringkasan</Link>
          <Link href="/admin/posts" className="flex min-h-[44px] items-center px-2">Post</Link>
          <Link href="/admin/orders" className="flex min-h-[44px] items-center px-2">Order</Link>
          <Link href="/dashboard" className="flex min-h-[44px] items-center px-2 text-mute">Keluar</Link>
        </nav>
      </div>
    </header>
  );
}
