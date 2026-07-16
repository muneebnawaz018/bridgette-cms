import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { displayFont } from '@/lib/theme';
import { colors, blackA, whiteA } from '@/lib/colors';

/**
 * Brand lockup for dark surfaces (nav rail, auth panel): the E3 mark in a white badge —
 * so its black half stays visible — beside the white "BRIDGETTE" wordmark. The raw
 * red/black logo can't sit on dark or gradient backgrounds, hence the badge treatment.
 */
export function BrandLockup({ subtitle, size = 'md' }: { subtitle?: string; size?: 'sm' | 'md' | 'lg' }) {
  const badge = { sm: 30, md: 38, lg: 46 }[size];
  const wordmark = { sm: '1.02rem', md: '1.22rem', lg: '1.55rem' }[size];

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
      <Box
        sx={{
          width: badge,
          height: badge,
          borderRadius: 2.5,
          bgcolor: colors.brand.white,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          boxShadow: `0 4px 14px ${blackA(0.28)}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-512.png" alt="Bridgette Enterprises" style={{ width: badge * 0.72, height: badge * 0.72 }} />
      </Box>
      <Box sx={{ lineHeight: 1 }}>
        <Typography
          component="span"
          sx={{ display: 'block', fontFamily: displayFont, fontWeight: 700, letterSpacing: '0.14em', color: colors.brand.white, fontSize: wordmark, lineHeight: 1 }}
        >
          BRIDGETTE
        </Typography>
        {subtitle && (
          <Typography
            component="span"
            sx={{ display: 'block', mt: 0.5, fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.22em', color: whiteA(0.5), textTransform: 'uppercase' }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
