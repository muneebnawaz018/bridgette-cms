/**
 * Create the Super Admin, or bring the existing one in line with .env.
 *
 *   npm run seed
 *
 * Reads MONGODB_URI + SUPER_ADMIN_* from .env.local, falling back to .env.
 *
 * This used to stop the moment a Super Admin existed, which meant editing
 * SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD had no effect and you needed a second script to
 * reconcile them. Now one command covers both: it creates the account when there isn't one,
 * and updates it in place when there is. Safe to run repeatedly, and it never makes a second
 * Super Admin.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../modules/auth/models/user.model';
import { hashPassword, verifyPassword } from '../modules/auth/password';
import { Role } from '../modules/auth/rbac';
import { UserStatus } from '../modules/auth/enums';

// .env.local first: dotenv keeps the first value it sees, so it wins over .env, which is the
// same precedence Next.js itself applies.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
  }

  await mongoose.connect(uri);

  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ isSuperAdmin: true });

  if (!existing) {
    const created = await User.create({
      name,
      email,
      role: Role.SuperAdmin,
      status: UserStatus.Active,
      isSuperAdmin: true,
      isProtected: true, // never deletable
      emailVerified: true,
      mustSetPassword: false,
      passwordHash,
    });
    console.log(`Super Admin created: ${created.email}`);
    await mongoose.disconnect();
    return;
  }

  // Refuse if a different account already holds the address we're moving to, rather than
  // tripping the unique index halfway through.
  const clash = await User.findOne({ email, _id: { $ne: existing._id } });
  if (clash) {
    throw new Error(`${email} already belongs to another account — change SUPER_ADMIN_EMAIL or remove that user`);
  }

  const emailChanged = existing.email !== email;
  existing.set({
    name,
    email,
    passwordHash,
    status: UserStatus.Active,
    emailVerified: true,
    mustSetPassword: false,
    pendingEmail: null,
  });
  await existing.save();

  // Read back and prove the stored hash really matches the intended password, so a silent
  // hashing change can never leave you locked out without warning.
  const after = await User.findById(existing._id).select('+passwordHash');
  const matches = await verifyPassword(password, after!.passwordHash as string);

  console.log(`Super Admin updated: ${after!.email}${emailChanged ? ' (email changed)' : ''}`);
  console.log(`  status=${after!.status} verified=${after!.emailVerified} mustSetPassword=${after!.mustSetPassword}`);
  console.log(`  password check: ${matches ? 'PASS — stored hash matches the env password' : 'FAIL'}`);
  console.log(`  total users: ${await User.countDocuments({})}`);

  if (!matches) {
    await mongoose.disconnect();
    throw new Error('the stored hash does not verify against SUPER_ADMIN_PASSWORD');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
