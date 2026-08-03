'use client';

import Link from '@mui/material/Link';
import { formatPhone, telHref } from '@/lib/format/countries';

/**
 * A phone number, formatted by the country service and dialable on tap.
 *
 * Every number in the app renders through here so the grouping is decided once, from the stored
 * country, rather than by whoever typed the string. Numbers are held as E.164, which is not a
 * readable form, so displaying one raw is always wrong.
 *
 * `fallback` covers the empty case (a customer with no number on file) — passing one renders it
 * as plain text, with no dead link left behind.
 */
export function PhoneLink({ value, fallback = '' }: { value?: string | null; fallback?: string }) {
  const href = telHref(value);
  if (!href) return <>{fallback}</>;

  return (
    <Link href={href} underline="hover" color="inherit">
      {formatPhone(value)}
    </Link>
  );
}
