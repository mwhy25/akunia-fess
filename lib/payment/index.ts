import type { PaymentProvider } from './types';
import { manualProvider } from './manual';
import { saweriaProvider } from './saweria';

const providers: Record<string, PaymentProvider> = {
  manual: manualProvider,
  saweria: saweriaProvider,
};

export const ACTIVE_PROVIDER = process.env.PAYMENT_PROVIDER || 'manual';

export function getProvider(name: string = ACTIVE_PROVIDER): PaymentProvider {
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return p;
}
