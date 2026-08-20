import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';

/*
 * Home is the default route. Sign-in is mandatory: no valid session → /login.
 *
 * In practice the middleware answers `/` with a 307 before this ever renders — redirecting
 * from here throws after the shell has flushed, which made the bare domain a titleless
 * `200 OK` carrying a meta refresh. This stays as the fallback for the case where the
 * middleware does not run, so the route is never reachable as a blank page.
 */
export default async function HomePage() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
