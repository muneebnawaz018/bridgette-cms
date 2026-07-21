import 'server-only';

/**
 * IP → approximate location. IP geolocation is city-level at best (never exact GPS).
 *
 * When the request arrives over loopback / a private LAN (typical in local dev, where the
 * server sees "::1" instead of a public address), we ask ipwho.is for this machine's own
 * public egress IP and geolocate that — so a session still shows a real IP + city instead
 * of a meaningless "::1".
 */

const LOCALHOST = new Set(['::1', '127.0.0.1', '0.0.0.0', 'localhost']);
const GEO_TIMEOUT_MS = 2500;

export interface Origin {
  ip: string | null; // public IP to store/display, or null when nothing better is known
  location: string | null; // "City, Region, Country" or null
}

/** First address from an `x-forwarded-for` chain, with the IPv4-mapped IPv6 prefix stripped. */
export function normalizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  const first = raw
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/i, '');
  return first || null;
}

/** True for loopback and RFC1918 private ranges (no meaningful public geolocation). */
export function isLocalIp(ip?: string | null): boolean {
  if (!ip) return true;
  if (LOCALHOST.has(ip)) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true; // link-local / ULA
  return false;
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toLocation(j: Record<string, unknown> | null): string | null {
  if (!j || j.success === false) return null;
  const parts = [j.city, j.region, j.country].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return parts.length ? parts.join(', ') : null;
}

/** "City, Region, Country" for a specific public IP (best-effort). */
export async function geolocate(rawIp?: string | null): Promise<string | null> {
  const ip = normalizeIp(rawIp);
  if (!ip || isLocalIp(ip)) return null;
  return toLocation(await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`));
}

/** This server's own public egress IP + location (used when the client IP is loopback). */
export async function selfOrigin(): Promise<Origin> {
  const j = await fetchJson('https://ipwho.is/');
  const ip = j && typeof j.ip === 'string' ? j.ip : null;
  return { ip, location: toLocation(j) };
}

/**
 * Resolve the IP + location to record for a session. Public client IP → geolocate it;
 * loopback/private → fall back to this machine's public egress IP.
 */
export async function resolveOrigin(rawIp?: string | null): Promise<Origin> {
  const ip = normalizeIp(rawIp);
  if (ip && !isLocalIp(ip)) {
    return { ip, location: await geolocate(ip) };
  }
  const self = await selfOrigin();
  return self.ip ? self : { ip: null, location: null };
}
