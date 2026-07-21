'use client';

import { colors } from '@/lib/colors';

export interface ProofImage {
  /** JPEG data URL. */
  data: string;
  name: string;
  contentType: string;
  /** Approx decoded byte size of the base64 payload. */
  size: number;
}

/**
 * Read a proof/screenshot image File and return a compressed JPEG data URL that stays legible
 * (longest side up to `max`px) while keeping the payload small — small enough for the JSON body
 * limit and light in the Mongo document. Mirrors the avatar downscaler, at a higher resolution
 * so a receipt is still readable.
 *
 * Throws if the file is not an image or cannot be decoded.
 */
export async function fileToProofImage(file: File, max = 1500, quality = 0.8): Promise<ProofImage> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image');

  const src = await readAsDataUrl(file);
  const img = await loadImage(src);

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image');

  // Flatten any transparency onto white so it does not become black in the JPEG.
  ctx.fillStyle = colors.brand.white;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const data = canvas.toDataURL('image/jpeg', quality);
  const base64 = data.slice(data.indexOf(',') + 1);
  const size = Math.floor((base64.length * 3) / 4);

  // Rename to .jpg since it is always re-encoded as JPEG.
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { data, name, contentType: 'image/jpeg', size };
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
