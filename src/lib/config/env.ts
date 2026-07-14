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

export const env = {
  get mongoUri() {
    return required('MONGODB_URI');
  },
  get jwtAccessSecret() {
    return required('JWT_ACCESS_SECRET');
  },
  get jwtRefreshSecret() {
    return required('JWT_REFRESH_SECRET');
  },
  accessTokenTtl: optional('JWT_ACCESS_TTL', '1h'),
  refreshTokenTtl: optional('JWT_REFRESH_TTL', '7d'),
  get appUrl() {
    return optional('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
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
