'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import { useApi } from '@/lib/api/useApi';
import type { LegalDoc } from '@/modules/legal/types';

/**
 * Renders a {@link LegalDoc} as a page with a "Download PDF" button. Shared by the system
 * Terms page and the Billing Terms page so the two documents look identical while saying
 * different things — the only difference between them is the `doc` passed in.
 *
 * "Download PDF" calls window.print(): the print stylesheet in globals.css hides the app shell
 * and this page's own controls (`.no-print`) and lifts the `.print-region` to the page, so the
 * browser's Save-as-PDF produces exactly what is on screen with no extra dependency.
 */
export function LegalDocument({
  doc,
  showContact = true,
}: {
  doc: LegalDoc;
  showContact?: boolean;
}) {
  const router = useRouter();

  // Contact line — the Super Admin's email, resolved live so it tracks whoever currently holds
  // that account rather than a hardcoded address. Only fetched when the doc wants a Contact
  // section.
  const { data } = useApi<{ email: string | null }>(showContact ? '/api/company/contact' : null, {
    globalLoading: false,
  });
  const contactEmail = showContact ? (data?.email ?? null) : null;
  const contactNumber = doc.sections.length + 1;

  return (
    <Box className="rise-in" sx={{ maxWidth: 860, mx: 'auto' }}>
      {/* Controls — excluded from the printed PDF. */}
      <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        {/* Returns to wherever the reader came from — the invoice, the footer, the dashboard —
            rather than always landing on one fixed page. */}
        <IconButton onClick={() => router.back()} aria-label="Back" sx={{ mr: 0.5 }}>
          <ArrowBackRounded />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {doc.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {doc.subtitle}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<FileDownloadRounded />}
          onClick={() => window.print()}
        >
          Download PDF
        </Button>
      </Box>

      <Paper className="print-region" sx={{ p: { xs: 3, md: 5 } }}>
        {/* Document header — shown on screen and in the PDF. */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {doc.title}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {doc.company}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {doc.effective}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 3 }}>
          {doc.intro}
        </Typography>
        <Divider sx={{ mb: 3 }} />

        <Stack spacing={4}>
          {doc.sections.map((section) => (
            <Box key={section.title}>
              <Typography
                variant="overline"
                sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: 1 }}
              >
                {section.title}
              </Typography>
              <Stack spacing={2.5} sx={{ mt: 1 }}>
                {section.clauses.map((clause) => (
                  <Box key={clause.heading}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {clause.heading}
                    </Typography>
                    <Stack spacing={1}>
                      {clause.paragraphs.map((p, i) => (
                        <Typography
                          key={i}
                          variant="body2"
                          color="text.secondary"
                          sx={{ lineHeight: 1.7 }}
                        >
                          {p}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}

          {showContact && (
            <Box>
              <Typography
                variant="overline"
                sx={{ fontWeight: 700, color: 'primary.main', letterSpacing: 1 }}
              >
                {contactNumber}. Contact
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.7 }}>
                Questions about these terms should be sent to {doc.company}
                {contactEmail ? (
                  <>
                    {' '}
                    at{' '}
                    <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {contactEmail}
                    </Box>
                  </>
                ) : null}
                . We aim to respond within a reasonable time on business days.
              </Typography>
            </Box>
          )}

          <Divider />

          <Typography variant="caption" color="text.secondary">
            These terms are a professional template provided for reference. Have them reviewed by
            qualified counsel before relying on them as a binding agreement. © {doc.company}.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
