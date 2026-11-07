import { requireAdmin } from '@/lib/auth';
import { SchedulerClient } from '@/components/admin/SchedulerClient';

export const dynamic = 'force-dynamic';

// Scheduler admin: impor antrian post dari xlsx lalu posting otomatis ke X
// lewat backend Flask/twikit. TANPA memotong kredit user — fitur internal.
export default async function AdminSchedulerPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-5xl">Scheduler</h1>
        <p className="mt-2 text-sm text-mute">
          Antrian post terjadwal (impor dari <span className="font-mono">index.xlsx</span>).
          <b> Tanpa kredit</b> — untuk admin saja. Posting lewat backend X.
        </p>
      </header>
      <SchedulerClient />
    </div>
  );
}
