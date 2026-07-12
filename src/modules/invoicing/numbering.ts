import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { Counter } from './models/counter.model';
import { InvoiceType } from './enums';

const PREFIX: Record<InvoiceType, string> = {
  [InvoiceType.Tax]: 'TAX',
  [InvoiceType.Cash]: 'CASH',
  [InvoiceType.PK]: 'PK',
};

const SEQ_PAD = 4;

function periodParts(date: Date): { yy: string; mm: string } {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return { yy, mm };
}

/**
 * Issue the next invoice number for a type. Monthly reset — the counter is keyed by
 * type + YY + MM, so `####` restarts at 0001 each month. Atomic `findOneAndUpdate`
 * guarantees no two concurrent callers get the same number.
 *
 * Format: `TAX-26-06-0001`.
 */
export async function issueInvoiceNumber(type: InvoiceType, date: Date = new Date()): Promise<string> {
  await connectDb();
  const { yy, mm } = periodParts(date);
  const key = `${PREFIX[type]}-${yy}-${mm}`;

  const doc = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const seq = String(doc.seq).padStart(SEQ_PAD, '0');
  return `${PREFIX[type]}-${yy}-${mm}-${seq}`;
}
