import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Metadata-only layout. The page itself is a Client Component and so cannot export
// `metadata`; a server layout wrapping it is the supported way to set the title.
export const metadata: Metadata = { title: 'Dashboard' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
