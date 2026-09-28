import { requireUser } from '@/lib/auth';
import { AppNav } from '@/components/layout/AppNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppNav username={user.username} credits={user.credits} isAdmin={user.role === 'admin'} />
      <main className="mx-auto min-h-[100dvh] max-w-3xl px-5 pb-28 pt-6 sm:pb-12">
        {user.is_banned && <p className="err mb-5" role="alert">Akun lu diblokir. Hubungi admin kalau ini keliru.</p>}
        {children}
      </main>
    </>
  );
}
