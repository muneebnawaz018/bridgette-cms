'use client';

import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { colors, redA } from '@/lib/colors';

/*
 * The resale certificate picker, shared by the staff customer dialog and the public intake form.
 *
 * One component because the two used to carry their own copy of the same accept list, size limit
 * and data-URL read — three places a rule could be tightened in one and forgotten in the other,
 * on a field whose whole purpose is evidence for a tax exemption.
 *
 * The file is read into a data URL rather than uploaded on its own: it rides along with the save,
 * so a picked file and an abandoned form leave nothing orphaned on the server.
 */

/** What a reseller certificate may be: a scan, a PDF, or a Word document. */
const CERT_ACCEPT_TYPES =
  /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$)/;
const CERT_ACCEPT =
  'image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** 4MB raw. Base64 inflates by a third, so the encoded body stays inside the route's limit. */
const CERT_MAX_BYTES = 4 * 1024 * 1024;

export interface CertificateFile {
  data: string;
  name: string;
  contentType: string;
  size: number;
}

export function CertificateDropzone({
  file,
  onPick,
  onRemove,
  onError,
  error,
  disabled,
  /** Read-only: no picker, and a download for the stored file if there is one. */
  downloadHref,
}: {
  /** The attached file, or its name alone when it is already stored on the record. */
  file: { name: string; size?: number } | null;
  onPick: (file: CertificateFile) => void;
  onRemove: () => void;
  onError: (message: string) => void;
  error?: string;
  disabled?: boolean;
  downloadHref?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const readOnly = Boolean(downloadHref) || !onPick;

  /* Shared by the picker and the drop target, so a dragged file is checked exactly as a browsed
     one is. The server re-reads the bytes regardless; this only saves a round trip. */
  const accept = useCallback(
    async (picked: File | undefined) => {
      if (!picked) return;

      if (!CERT_ACCEPT_TYPES.test(picked.type)) {
        onError('Attach an image, a PDF or a Word document');
        return;
      }
      if (picked.size > CERT_MAX_BYTES) {
        onError(`That file is ${(picked.size / 1024 / 1024).toFixed(1)}MB; the limit is 4MB`);
        return;
      }
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read that file'));
          reader.readAsDataURL(picked);
        });
        onPick({ data, name: picked.name, contentType: picked.type, size: picked.size });
      } catch {
        onError('Could not read that file');
      }
    },
    [onPick, onError],
  );

  const input = (
    <input
      hidden
      type="file"
      accept={CERT_ACCEPT}
      disabled={disabled}
      onChange={(e) => {
        const picked = e.target.files?.[0];
        e.target.value = ''; // let the same file be re-picked after an error
        void accept(picked);
      }}
    />
  );

  return (
    <>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !readOnly) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled || readOnly) return;
          void accept(e.dataTransfer.files?.[0]);
        }}
        sx={{
          p: file ? 2 : 3,
          borderRadius: 2,
          border: '2px dashed',
          borderColor: error
            ? colors.status.error
            : dragging
              ? colors.brand.red
              : colors.surface.border,
          bgcolor: dragging ? redA(0.04) : colors.surface.subtle,
          transition: 'border-color 120ms, background-color 120ms',
        }}
      >
        {file ? (
          <Stack direction="row" spacing={2} alignItems="center">
            <DescriptionRounded sx={{ color: colors.status.success, flexShrink: 0 }} />
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {file.name}
              </Typography>
              {file.size !== undefined && (
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024).toFixed(0)} KB attached
                </Typography>
              )}
            </Box>
            {downloadHref ? (
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                component="a"
                href={downloadHref}
                download
                startIcon={<DownloadRounded />}
                sx={{ flexShrink: 0 }}
              >
                Download
              </Button>
            ) : (
              !disabled && (
                <>
                  <Button
                    component="label"
                    size="small"
                    variant="outlined"
                    color="inherit"
                    startIcon={<UploadFileRounded />}
                    sx={{ flexShrink: 0 }}
                  >
                    Replace
                    {input}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineRounded />}
                    onClick={onRemove}
                    sx={{ flexShrink: 0 }}
                  >
                    Remove
                  </Button>
                </>
              )
            )}
          </Stack>
        ) : (
          <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center' }}>
            <CloudUploadRounded sx={{ fontSize: 40, color: colors.ink[300] }} />
            {readOnly || disabled ? (
              <Typography variant="body2" color="text.secondary">
                No certificate on file.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Drag a file here, or
                </Typography>
                <Button component="label" variant="outlined" startIcon={<UploadFileRounded />}>
                  Choose a file
                  {input}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Image, PDF or Word document, up to 4MB.
                </Typography>
              </>
            )}
          </Stack>
        )}
      </Box>
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
          {error}
        </Typography>
      )}
    </>
  );
}
