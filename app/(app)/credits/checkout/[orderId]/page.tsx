import { CheckoutView } from '@/components/payment/CheckoutView';

export default function CheckoutPage({ params }: { params: { orderId: string } }) {
  return (
    <div className="space-y-6">
      <h1 className="display text-[clamp(40px,12vw,72px)]">Selesaikan<br /><span className="text-red">pembayaran</span></h1>
      <CheckoutView orderId={params.orderId} />
    </div>
  );
}
