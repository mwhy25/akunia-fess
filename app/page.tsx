export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getUser } from '@/lib/auth';
import { LandingClient } from '@/components/landing/LandingClient';

export default async function Home() {
  const user = await getUser();
  return (
    <Suspense>
      <LandingClient loggedIn={!!user} />
    </Suspense>
  );
}
