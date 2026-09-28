export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  description: string;
  expiresInMinutes: number;
}

export interface CreatePaymentResult {
  providerRef: string;
  qrString?: string;
  qrImage?: string;
  invoiceUrl?: string;
  totalPaid: number;
  expiresAt: string;
}

export interface WebhookResult {
  valid: boolean;
  providerRef?: string;
  orderId?: string;
  amountPaid?: number;
}

export interface PaymentProvider {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  verifyWebhook(req: Request): Promise<WebhookResult>;
}
