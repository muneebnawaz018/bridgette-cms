import { handle, ok } from '@/lib/api/respond';
import { logout } from '@/modules/auth';

export const POST = handle(async () => {
  await logout();
  return ok({ loggedOut: true });
});
