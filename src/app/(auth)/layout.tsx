import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';

// Auth pages (login, forgot, set/reset password) are for signed-OUT users. If a valid
// session exists, skip them and go straight to the dashboard.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session) redirect('/dashboard');
  return <>{children}</>;
}
