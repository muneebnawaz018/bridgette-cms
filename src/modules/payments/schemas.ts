import { z } from 'zod';
import { PaymentMethod } from '@/modules/invoicing/enums';

export const recordPaymentSchema = z.object({
  amount: z.number().positive('Amount must be greater than zero'),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional(),
  account: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  allowOverpay: z.boolean().optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
