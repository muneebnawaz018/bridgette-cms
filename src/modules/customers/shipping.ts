import { formatAddress, isBlankAddress, type AddressParts } from './address';

/**
 * Where a customer's goods can go.
 *
 * One customer, several delivery points: a club with two grounds, a school and the coach who
 * signs for the boxes. The list lives on the customer record so raising an invoice is a pick
 * rather than a retype, and an invoice keeps its own copy of whichever was picked — correcting
 * the customer's address later must not silently rewrite what an invoice already shipped to.
 */
export interface ShippingAddress {
  name?: string;
  phone?: string;
  /** The printable one-liner, derived from the parts and stored alongside them. */
  address?: string;
  /** Null as well as undefined: Mongo hands back a null for a subdocument never written. */
  addressParts?: AddressParts | null;
}

/** What the customer record holds, in either the current shape or the one that predates it. */
interface WithShipping {
  shippingAddresses?: ShippingAddress[] | null;
  /** The single address this replaced. Still written by the customer's own intake form. */
  shipping?: (ShippingAddress & { sameAsBilling?: boolean }) | null;
}

/**
 * Every delivery address on a record, newest shape first.
 *
 * Falls back to the single `shipping` block for customers saved before the list existed — those
 * records are read every day and rewriting the collection to add an empty array would be a
 * migration run for nothing. Saving one of them through the form writes the list and clears the
 * old block, so a record migrates itself the first time somebody edits it.
 *
 * An empty result means "send it where the bill goes", which is the normal case.
 */
export function shippingAddressesFor(customer: WithShipping): ShippingAddress[] {
  const list = customer.shippingAddresses;
  if (list?.length) return list;

  const legacy = customer.shipping;
  if (!legacy || legacy.sameAsBilling !== false) return [];
  return [
    {
      name: legacy.name,
      phone: legacy.phone,
      address: legacy.address,
      addressParts: legacy.addressParts,
    },
  ];
}

/**
 * Normalise what a form sent into what gets stored: the printable one-liner is derived here and
 * never accepted from the client, so the parts and the line can never disagree.
 */
export function toStoredAddresses(
  input: Array<{ name?: string; phone?: string; addressParts?: AddressParts }> | undefined,
): ShippingAddress[] {
  if (!input?.length) return [];
  return input.map((a) => ({
    name: a.name,
    phone: a.phone,
    addressParts: isBlankAddress(a.addressParts) ? undefined : a.addressParts,
    address: isBlankAddress(a.addressParts) ? undefined : formatAddress(a.addressParts),
  }));
}
