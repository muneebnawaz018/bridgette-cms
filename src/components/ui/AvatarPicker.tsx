'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Box from '@mui/material/Box';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import EditRounded from '@mui/icons-material/EditRounded';
import { Modal } from '@/components/ui/Modal';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { blackA, whiteA } from '@/lib/colors';

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
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const hasPhoto = Boolean(src);

  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.previewUrl);
  }, [pending]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after cancelling or removing
    if (!file) return;
    setPending({ file, previewUrl: URL.createObjectURL(file) });
  }

  function confirmPending() {
    if (pending) onPick?.(pending.file);
    setPending(null);
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
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: whiteA(0.6),
          }}
        >
          <BrandLoader minHeight={0} label={null} size={Math.round(size * 0.5)} />
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
              // MUI's Avatar is position:relative, so it shares a stacking context with this
              // button — without an explicit z-index the uploaded photo paints over it.
              zIndex: 2,
              bgcolor: 'background.paper',
              border: (t) => `1px solid ${t.palette.divider}`,
              boxShadow: (t) => t.shadows[1],
              opacity: 0,
              transition: 'opacity .18s ease, background-image .16s ease',
              // The tint layers ON TOP of the opaque paper fill rather than replacing it —
              // setting a translucent bgcolor here would let the photo show through.
              '&:hover': { backgroundImage: `linear-gradient(${blackA(0.06)}, ${blackA(0.06)})` },
              // No hover on touch — keep it discoverable there.
              '@media (hover: none)': { opacity: 1 },
            }}
          >
            <EditRounded fontSize="small" />
          </IconButton>
          <input ref={inputRef} hidden type="file" accept="image/*" onChange={handleChange} />
        </>
      )}

      {/* Confirm the picked file before it replaces anything */}
      <ConfirmDialog
        open={Boolean(pending)}
        title={hasPhoto ? 'Replace photo?' : 'Use this photo?'}
        description={
          hasPhoto
            ? 'This replaces the current photo. You can change it again at any time.'
            : 'This becomes the profile photo. You can change it again at any time.'
        }
        confirmLabel="Use"
        onConfirm={confirmPending}
        onClose={() => setPending(null)}
      >
        {pending && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 1 }}>
            <Avatar
              src={pending.previewUrl}
              alt={pending.file.name}
              sx={{ width: 140, height: 140, boxShadow: (t) => t.shadows[2] }}
            />
          </Box>
        )}
      </ConfirmDialog>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={title} maxWidth="lg">
        {src && (
          <Box sx={{ display: 'grid', placeItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={title}
              // Avatars are stored downscaled to ~256px, so this is capped by width rather
              // than stretched past the source and left blurry.
              style={{ maxWidth: '100%', maxHeight: '82vh', borderRadius: 12 }}
            />
          </Box>
        )}
      </Modal>
    </Box>
  );
}
