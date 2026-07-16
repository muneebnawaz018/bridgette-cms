'use client';

import { colors } from '@/lib/colors';

/**
 * Read an image File and return a small, square-ish JPEG data URL suitable for a profile
 * photo. The image is downscaled so the longest side is at most `max` px (default 256),
 * which keeps the stored string tiny (typically 15–50KB) and well under the server cap.
 *
 * Throws if the file is not an image or cannot be decoded.
 */
export async function fileToAvatarDataUrl(file: File, max = 256, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image');

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');

  // JPEG has no alpha channel, and an untouched canvas is transparent black — exporting a
  // transparent PNG straight to JPEG would turn its see-through areas black. Paint white
  // first so transparency flattens onto white instead.
  ctx.fillStyle = colors.brand.white;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // JPEG keeps the payload small.
  return canvas.toDataURL('image/jpeg', quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image'));
    img.src = src;
  });
}
