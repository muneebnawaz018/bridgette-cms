import { BrandLoader } from '@/components/ui/BrandLoader';

/*
 * The print tab opens in a new window, so its very first paint is this — not the app shell the
 * user just came from. Without a segment-level loading state Next falls back to a blank page,
 * which reads as a broken link for the moment the route is compiling or streaming.
 */
export default function Loading() {
  return <BrandLoader fullscreen />;
}
