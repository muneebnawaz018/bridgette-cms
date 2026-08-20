'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { BrandLockup } from '@/components/layout/BrandLockup';
import { colors, gradients, whiteA, blackA } from '@/lib/colors';

const HIGHLIGHTS = [
  'Role-based access for every action',
  'Tax, Cash & PK invoicing in one place',
  'Payments, states & full audit trail',
];

/**
 * Split-screen auth shell: a branded gradient panel (desktop) beside the form. Shared by
 * login, forgot / reset / set-password. On mobile the panel is hidden and a compact logo
 * sits above the form.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex' }}>
      {/* Brand panel — desktop only */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'relative',
          flex: '1 1 46%',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { md: 5, lg: 7 },
          color: colors.onDark.text,
          background: gradients.authPanel,
        }}
      >
        {/* Decorative soft washes + oversized watermark mark */}
        <Box
          sx={{
            position: 'absolute',
            top: -140,
            right: -120,
            width: 420,
            height: 420,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${whiteA(0.16)}, transparent 70%)`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -160,
            left: -100,
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${blackA(0.35)}, transparent 70%)`,
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: -30,
            bottom: -20,
            width: 300,
            opacity: 0.06,
            transform: 'rotate(-8deg)',
          }}
        >
          <Image
            src="/brand/icon-512.png"
            alt=""
            width={512}
            height={512}
            style={{ width: '100%', height: 'auto', filter: 'grayscale(1) brightness(3)' }}
          />
        </Box>

        <Box sx={{ position: 'relative' }}>
          <BrandLockup size="md" subtitle="Management Portal" />
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 460 }}>
          <Typography variant="h3" sx={{ color: colors.onDark.text, fontWeight: 800 }}>
            Billing, payments, and customers in one place.
          </Typography>
          <Typography
            sx={{ mt: 2, mb: 3.5, color: whiteA(0.82), fontSize: '1.02rem', lineHeight: 1.6 }}
          >
            The Bridgette Enterprises portal for secure invoicing and day-to-day operations.
          </Typography>
          <Stack spacing={1.6}>
            {HIGHLIGHTS.map((h) => (
              <Box key={h} sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
                <CheckCircleRounded sx={{ fontSize: 20, color: whiteA(0.92) }} />
                <Typography sx={{ color: whiteA(0.9), fontWeight: 500 }}>{h}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>

        <Typography sx={{ position: 'relative', color: whiteA(0.55), fontSize: '0.8rem' }}>
          © {new Date().getFullYear()} Bridgette Enterprises LLC
        </Typography>
      </Box>

      {/* Form area */}
      <Box
        sx={{
          flex: { xs: '1 1 100%', md: '1 1 54%' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 5 },
          bgcolor: 'background.default',
        }}
      >
        <Box className="rise-in" sx={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo (brand panel is hidden here) */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 3.5 }}>
            <Image
              src="/brand/logo.png"
              alt="Bridgette Enterprises"
              width={1978}
              height={1145}
              style={{ height: 46, width: 'auto' }}
            />
          </Box>

          {/* `component="h1"` keeps the h4 type scale but emits a real <h1>. Without it the
              sign-in page — the only page here a crawler can index — opened its heading
              outline at <h4>, which reads as a page with no main heading. */}
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 0.75, mb: 3.5 }}>
              {subtitle}
            </Typography>
          )}
          {!subtitle && <Box sx={{ mb: 3.5 }} />}

          {children}
        </Box>
      </Box>
    </Box>
  );
}
