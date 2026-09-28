'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push('/');
        router.refresh();
      }}
    >
      Keluar dari akun
    </button>
  );
}
