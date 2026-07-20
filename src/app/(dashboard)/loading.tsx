import { GlobalLoading } from '@/components/ui/GlobalLoading';

/**
 * Route-transition fallback. It renders nothing and asks for the app-wide overlay instead:
 * anything drawn here lands inside the dashboard layout, so it could never cover the sidebar
 * or the top bar.
 */
export default function Loading() {
  return <GlobalLoading />;
}
