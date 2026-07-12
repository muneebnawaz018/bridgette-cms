import type { FilterQuery } from 'mongoose';
import { Permission, can, type SessionUser } from '@/modules/auth';
import type { InvoiceDoc } from './models/invoice.model';

/**
 * Role-based visibility filter for invoices, applied at the DB query BEFORE pagination.
 *
 * - Archived invoices are visible only to Admin+ (InvoiceViewAllArchived) or their creator.
 * - Everyone with view access sees non-archived invoices.
 */
export function invoiceVisibilityFilter(session: SessionUser): FilterQuery<InvoiceDoc> {
  if (can(session.role, Permission.InvoiceViewAllArchived)) {
    return {}; // sees everything, incl. all archived
  }
  return {
    $or: [{ isArchived: { $ne: true } }, { isArchived: true, createdBy: session.userId }],
  };
}

/** True if this session may view a specific invoice doc (post-fetch guard). */
export function canViewInvoice(session: SessionUser, invoice: Pick<InvoiceDoc, 'isArchived' | 'createdBy'>): boolean {
  if (!invoice.isArchived) return true;
  if (can(session.role, Permission.InvoiceViewAllArchived)) return true;
  return String(invoice.createdBy) === session.userId;
}
