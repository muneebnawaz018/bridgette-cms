import type { Metadata } from 'next';
import Image from 'next/image';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { colors } from '@/lib/colors';
import { displayFont } from '@/lib/theme';

/**
 * The 404 page.
 *
 * This file replaces a `[...not_found]` catch-all route that redirected every unmatched URL to
 * `/`. A catch-all shadows Next's built-in not-found handler, so no URL on the site could ever
 * answer 404: a typo, a stale bookmark and a crawler probing for `/wp-admin` all got `200 OK`
 * with the sign-in page. Google calls that a soft 404, reports it in Search Console, and spends
 * crawl budget re-checking an unbounded set of URLs that all look like real pages.
 *
 * Deleting the catch-all restores the default, and Next renders this file with a real 404
 * status. The root layout's `noindex` applies here too, so the page itself never gets indexed.
 */

export const metadata: Metadata = {
  title: 'Page not found',
  // Inherited from the root layout, repeated here so the intent survives any later change
  // to that default.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: colors.surface.canvas,
        px: 3,
        py: 6,
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ maxWidth: 460, textAlign: 'center' }}>
        <Image
          src="/brand/logo.png"
          alt="Bridgette Enterprises"
          width={1978}
          height={1145}
          priority={false}
          style={{ height: 44, width: 'auto' }}
        />

        <Typography
          component="p"
          sx={{
            fontFamily: displayFont,
            fontWeight: 700,
            fontSize: { xs: '4.5rem', sm: '5.5rem' },
            lineHeight: 1,
            letterSpacing: '0.04em',
            color: colors.brand.red,
          }}
        >
          404
        </Typography>

        <Box>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            Page not found
          </Typography>
          <Typography sx={{ mt: 1, color: colors.text.secondary }}>
            That link may be out of date, or the page may have moved. Nothing was lost — head back
            to the portal and carry on.
          </Typography>
        </Box>

        {/* A plain anchor rather than the router: a 404 is a cold entry point, so there is no
            client-side history to preserve and a full navigation is the simpler thing. */}
        <Button href="/login" variant="contained" size="large" disableElevation>
          Go to the portal
        </Button>
      </Stack>
    </Box>
  );
}
