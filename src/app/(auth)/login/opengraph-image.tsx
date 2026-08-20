import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOpengraphCard } from '@/lib/seo/opengraph-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = OG_ALT;

export default function LoginOpengraphImage() {
  return renderOpengraphCard();
}
