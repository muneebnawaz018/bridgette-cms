import { ImageResponse } from 'next/og';
import { colors } from '@/lib/colors';

/**
 * The shared link-preview card.
 *
 * This lives in a module rather than directly in a route file because Next merges metadata
 * shallowly. The `opengraph-image` file convention is resolved per segment, and a segment that
 * declares its own `openGraph` block — the sign-in route does, for its canonical URL and
 * description — replaces the parent's `images` wholesale. A root-level card alone therefore
 * reached every route except the only one anyone ever shares. Each segment that overrides
 * `openGraph` needs its own `opengraph-image` file, and they all render this.
 *
 * `/brand/logo.png` is deliberately not reused: at 1978x1145 (1.73:1) every platform crops or
 * letterboxes it. This draws at the 1200x630 (1.91:1) that Open Graph and Twitter both expect.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';
export const OG_ALT = 'Bridgette Enterprises Management Portal';

export function renderOpengraphCard(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 88px',
          background: `linear-gradient(135deg, ${colors.brand.red} 0%, ${colors.brand.redDark} 55%, #7a0b10 100%)`,
          color: colors.brand.white,
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 12,
            fontWeight: 600,
            opacity: 0.72,
            textTransform: 'uppercase',
          }}
        >
          Bridgette Enterprises
        </div>

        <div
          style={{
            marginTop: 22,
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.05,
          }}
        >
          Management Portal
        </div>

        <div style={{ marginTop: 28, fontSize: 34, opacity: 0.86, lineHeight: 1.35 }}>
          Invoicing, payments, customers and shipping · in one place.
        </div>

        {/* Brand rule, mirroring the red underline used across the app's headings. */}
        <div
          style={{
            marginTop: 44,
            width: 168,
            height: 8,
            borderRadius: 4,
            background: colors.brand.white,
            opacity: 0.9,
          }}
        />
      </div>
    ),
    OG_SIZE,
  );
}
