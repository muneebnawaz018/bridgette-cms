import 'server-only';

/**
 * Server-side environment config. Reads from process.env with light validation.
 * Access via `env.X`; throws a clear error the first time a required var is missing.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function requireSecret(name: string): string {
  const v = required(name);
  if (process.env.NODE_ENV === 'production') {
    if (v.length < 32) {
      throw new Error(
        `${name} must be at least 32 characters in production (use \`openssl rand -base64 48\`)`,
      );
    }
    if (/change|placeholder|example|secret|test/i.test(v)) {
      throw new Error(`${name} still looks like a placeholder — set a strong random value`);
    }
  }
  return v;
}

export const env = {
  get mongoUri() {
    return required('MONGODB_URI');
  },
  get jwtAccessSecret() {
    return requireSecret('JWT_ACCESS_SECRET');
  },
  get jwtRefreshSecret() {
    return requireSecret('JWT_REFRESH_SECRET');
  },
  accessTokenTtl: optional('JWT_ACCESS_TTL', '1h'),
  refreshTokenTtl: optional('JWT_REFRESH_TTL', '7d'),
  /**
   * Canonical Super Admin contact address, shown as the billing/terms contact. Read from the
   * seed config, not the live DB row: it stays the intended mailbox even if the account's own
   * profile email is later changed to a personal address.
   */
  superAdminEmail: optional('SUPER_ADMIN_EMAIL'),
  /**
   * Public origin of this deployment. Every link we email is built from it: the invite
   * sign-in link, the password reset link, and the "open invoice" button on reminders.
   *
   * Falling back to localhost is right in development and actively harmful in production,
   * where it produces mail that looks perfectly normal and whose links resolve to the
   * recipient's own machine. That failure is invisible from the server, so production
   * refuses to start instead: a boot error is cheap, a fortnight of invites nobody could
   * accept is not.
   */
  get appUrl() {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const isProd = process.env.NODE_ENV === 'production';

    if (!raw) {
      if (isProd) throw new Error('Missing required env var: NEXT_PUBLIC_SITE_URL');
      return 'http://localhost:3000';
    }
    // Catches the common deploy mistake of copying .env up to the server unchanged.
    if (isProd && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(raw)) {
      throw new Error(
        `NEXT_PUBLIC_SITE_URL is "${raw}" in production — set it to the real public domain, ` +
          "otherwise every emailed link points at the recipient's own machine",
      );
    }
    // A trailing slash would double up, since callers append "/login", "/invoices/…".
    return raw.replace(/\/+$/, '');
  },
  smtp: {
    get host() {
      return required('SMTP_HOST');
    },
    port: Number(optional('SMTP_PORT', '587')),
    secure: optional('SMTP_SECURE', 'false') === 'true',
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
    from: optional('SMTP_FROM', 'Bridgette Portal <no-reply@bridgetteenterprises.com>'),
  },
  isProd: process.env.NODE_ENV === 'production',
} as const;
