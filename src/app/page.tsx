import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';

// Home is the default route. Sign-in is mandatory: no valid session → /login.
export default async function HomePage() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
