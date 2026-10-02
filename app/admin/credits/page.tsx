import { ManualCreditForm } from '@/components/admin/ManualCreditForm';

export const dynamic = 'force-dynamic';

export default function AdminCreditsPage() {
  return (
    <div className="space-y-5">
      <h1 className="display text-5xl">Kredit Manual</h1>
      <p className="text-sm text-mute">
        Tambah kredit ke satu atau beberapa akun sekaligus. Nominal <b>Rp0</b> dan tercatat di transaksi/order sebagai topup admin.
      </p>
      <ManualCreditForm />
    </div>
  );
}
