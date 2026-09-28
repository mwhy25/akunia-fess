import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PasswordForm } from '@/components/auth/PasswordForm';
import { LogoutButton } from '@/components/auth/LogoutButton';

export default async function ProfilePage({ searchParams }: { searchParams: { reset?: string } }) {
  const user = await requireUser();
  const joined = new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-8">
      <h1 className="display text-[clamp(44px,13vw,80px)]">Akun<br /><span className="text-red">lu</span></h1>

      <dl className="border-[3px] border-line">
        {[['Username', user.username], ['Email', user.email ?? '-'], ['Bergabung', joined], ['Kredit', String(user.credits)]].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b-[3px] border-line p-4 last:border-b-0">
            <dt className="text-mute">{k}</dt>
            <dd className="break-all text-right font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <PasswordForm highlight={searchParams.reset === '1'} />

      {user.role === 'admin' && <Link href="/admin" className="btn btn-ghost">Buka panel admin</Link>}
      <LogoutButton />
    </div>
  );
}
