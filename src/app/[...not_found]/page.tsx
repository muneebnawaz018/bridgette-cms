import { redirect } from 'next/navigation';

// Catch-all for any route not matched by a real page → send to home.
// Concrete routes always take precedence over this catch-all.
export default function CatchAll() {
  redirect('/');
}
