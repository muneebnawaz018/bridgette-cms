import { Types, type FilterQuery } from 'mongoose';
import { Permission, can, type SessionUser } from '@/modules/auth';
import type { InvoiceDoc } from './models/invoice.model';
import type { InvoiceView } from './schemas';

/**
 * Role-based visibility for invoices, applied at the DB query BEFORE pagination.
 *
 * Ownership tier (the primary rule):
 * - Super Admin / Admin see every invoice, from every user.
 * - Every other role sees only the invoices they created.
 *
 * Soft-removal tier (layered on top, per view):
 * - Archive: hidden from the default list; surfaced under the `archived` view.
 * - Delete: hidden from everyone but admins, under the `deleted` view.
 *
 * `active` (default) shows neither archived nor deleted. Admin status here is the same grant
 * that lets a role see other people's archived invoices, so one check covers both tiers.
 */
export function invoiceVisibilityFilter(
  session: SessionUser,
  view: InvoiceView = 'active',
): FilterQuery<InvoiceDoc> {
  const isAdmin = can(session.role, Permission.InvoiceViewAllArchived);
  // Non-admins are scoped to their own invoices in every view; admins are unrestricted.
  // `createdBy` is stored as an ObjectId. This filter feeds `Invoice.aggregate` (list + stats),
  // and Mongoose does NOT cast aggregation `$match` against the schema the way `find()` does —
  // so a raw string id silently matches nothing and a non-admin sees an empty list. Cast it here.
  const owner: FilterQuery<InvoiceDoc> = isAdmin
    ? {}
    : { createdBy: new Types.ObjectId(session.userId) };

  if (view === 'all') {
    // Everything this session may see. Admins: every invoice. Others: their own, minus deleted.
    return isAdmin ? {} : { ...owner, isDeleted: { $ne: true } };
  }

  if (view === 'deleted') {
    // Deleted invoices are admins-only. A non-admin request resolves to nothing.
    return isAdmin ? { isDeleted: true } : { number: ' __never__' };
  }

  if (view === 'archived') {
    return { ...owner, isArchived: true, isDeleted: { $ne: true } };
  }

  // active: exclude archived and deleted, scoped to the owner for non-admins.
  return { ...owner, isArchived: { $ne: true }, isDeleted: { $ne: true } };
}

/** True if this session may view a specific invoice doc (post-fetch guard). */
export function canViewInvoice(
  session: SessionUser,
  invoice: Pick<InvoiceDoc, 'isArchived' | 'isDeleted' | 'createdBy'>,
): boolean {
  const isAdmin = can(session.role, Permission.InvoiceViewAllArchived);
  if (isAdmin) return true; // admins see everything, including archived and deleted
  if (invoice.isDeleted) return false; // deleted is admins-only
  return String(invoice.createdBy) === session.userId; // others: their own invoices only
}
