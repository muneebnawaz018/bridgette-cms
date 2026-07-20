import 'server-only';
import { promises as dns } from 'node:dns';
import { logger } from '@/lib/logger/logger';

/**
 * Free deliverability check for an email address — no third-party service.
 *
 * Zod already proves an address is well-formed; that says nothing about whether it can
 * actually receive mail. A typo like `@gmial.com` is perfectly valid syntax and silently
 * black-holes the invite. This resolves the domain's MX records instead: no MX (and no A
 * fallback) means no mail server exists, so the invite could never arrive.
 *
 * What this deliberately does NOT do is probe the mailbox itself with SMTP `RCPT TO`. Most
 * providers answer "accepted" for every address to defeat exactly that kind of harvesting,
 * so the result would be noise, and the probing gets the sending IP blocklisted.
 */

/** Throwaway providers — an invite sent here is effectively lost. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'yopmail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'trashmail.com',
  'sharklasers.com',
  'throwawaymail.com',
  'getnada.com',
  'dispostable.com',
  'fakeinbox.com',
  'maildrop.cc',
  'mintemail.com',
]);

/** Domains are stable, so a small cache keeps repeated invites off the DNS path. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { ok: boolean; at: number }>();

export class UndeliverableEmailError extends Error {}

async function domainAcceptsMail(domain: string): Promise<boolean> {
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ok;

  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0 && mx.some((r) => r.exchange);
  } catch {
    // No MX record. RFC 5321 allows falling back to the A record as the mail exchanger.
    try {
      const a = await dns.resolve4(domain);
      ok = a.length > 0;
    } catch {
      ok = false;
    }
  }

  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

/**
 * Throws `UndeliverableEmailError` when the address cannot plausibly receive mail.
 *
 * DNS problems that are not the address's fault (timeout, resolver down) resolve to "allow" —
 * blocking a legitimate invite because our resolver hiccupped would be the worse failure.
 */
export async function assertDeliverableEmail(email: string): Promise<void> {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) throw new UndeliverableEmailError('That email address is not valid');

  if (DISPOSABLE_DOMAINS.has(domain)) {
    throw new UndeliverableEmailError('Disposable email addresses are not accepted');
  }

  try {
    const accepts = await domainAcceptsMail(domain);
    if (!accepts) {
      throw new UndeliverableEmailError(
        // Wording stays neutral: this runs for invites and for email changes alike.
        `"${domain}" has no mail server, so the message could not be delivered. Check the address for a typo.`,
      );
    }
  } catch (err) {
    if (err instanceof UndeliverableEmailError) throw err;
    // Resolver failure — log it and let the address through.
    logger.warn('email domain check could not complete; allowing the address', {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
