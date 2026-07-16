'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import EditRounded from '@mui/icons-material/EditRounded';
import { Modal } from '@/components/ui/Modal';
import { whiteA } from '@/lib/colors';

/**
 * Profile photo control.
 *
 * - Click the photo to open it full size (it owns that viewer itself).
 * - Hover reveals an edit button; clicking that opens the file picker instead. On touch
 *   devices there is no hover, so the button stays visible.
 * - With no photo yet, clicking anywhere opens the picker — there is nothing to view.
 */
export function AvatarPicker({
  src,
  fallback,
  title = 'Photo',
  size = 96,
  canEdit = false,
  uploading = false,
  onPick,
}: {
  src?: string | null;
  /** Single letter shown when there is no photo. */
  fallback: string;
  /** Heading for the full-size viewer. */
  title?: string;
  size?: number;
  canEdit?: boolean;
  uploading?: boolean;
  onPick?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const hasPhoto = Boolean(src);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a remove
    if (file) onPick?.(file);
  }

  const onAvatarClick = hasPhoto
    ? () => setViewOpen(true)
    : canEdit
      ? () => inputRef.current?.click()
      : undefined;

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        '&:hover .avatar-edit': { opacity: 1 },
      }}
    >
      <Avatar
        src={src || undefined}
        onClick={onAvatarClick}
        sx={{
          width: size,
          height: size,
          bgcolor: 'primary.main',
          fontWeight: 700,
          fontSize: size * 0.4,
          cursor: onAvatarClick ? (hasPhoto ? 'zoom-in' : 'pointer') : 'default',
          boxShadow: (t) => t.shadows[2],
        }}
      >
        {fallback}
      </Avatar>

      {uploading && (
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: whiteA(0.6) }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {canEdit && (
        <>
          <IconButton
            className="avatar-edit"
            size="small"
            disabled={uploading}
            aria-label={hasPhoto ? 'Change photo' : 'Upload photo'}
            onClick={() => inputRef.current?.click()}
            sx={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              bgcolor: 'background.paper',
              border: (t) => `1px solid ${t.palette.divider}`,
              boxShadow: (t) => t.shadows[1],
              opacity: 0,
              transition: 'opacity .18s ease',
              '&:hover': { bgcolor: 'action.hover' },
              // No hover on touch — keep it discoverable there.
              '@media (hover: none)': { opacity: 1 },
            }}
          >
            <EditRounded fontSize="small" />
          </IconButton>
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={handleChange} />
        </>
      )}

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={title} maxWidth="sm">
        {src && (
          <Box sx={{ display: 'grid', placeItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={title} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12 }} />
          </Box>
        )}
      </Modal>
    </Box>
  );
}
