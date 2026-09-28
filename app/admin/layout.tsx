import { requireAdmin } from '@/lib/auth';
import { AdminNav } from '@/components/layout/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-6">{children}</main>
    </>
  );
}
