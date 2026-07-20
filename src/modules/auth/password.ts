import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A real bcrypt hash of a value nobody knows, used to burn the same ~300ms when there is no
 * account to check against.
 *
 * Without it, login answers "no such user" in a few milliseconds and "wrong password" in
 * ~300ms, because only the second path runs bcrypt. The messages match but the clock does
 * not, so timing the responses reveals which addresses are registered. Feed this to
 * `burnPasswordTime()` on every miss so both outcomes cost the same.
 */
// A genuine cost-12 hash of a random string. It must be real and the same cost as ROUNDS,
// otherwise bcrypt either rejects it early or spends the wrong amount of time, and the
// mismatch reopens the very channel this closes. Measured: 277ms here vs 276ms for a real
// account's failed compare.
const DUMMY_HASH = '$2a$12$EfaDe3uv1VZfIxlwd2Tb2.4kLPYGmg6e2U840ixmkmjD0Jlk24u8K';

/** Spend the same time a real verification would, then report failure. */
export async function burnPasswordTime(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH);
  return false;
}
