/**
 * Seed the single Super Admin. Idempotent — running twice won't duplicate.
 *
 *   npm run seed
 *
 * Reads MONGODB_URI + SUPER_ADMIN_* from .env.local.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../modules/auth/models/user.model';
import { hashPassword } from '../modules/auth/password';
import { Role } from '../modules/auth/rbac';
import { UserStatus } from '../modules/auth/enums';

dotenv.config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env.local');
  }

  await mongoose.connect(uri);

  const existing = await User.findOne({ isSuperAdmin: true });
  if (existing) {
    console.log(`✓ Super Admin already exists: ${existing.email} — nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    role: Role.SuperAdmin,
    status: UserStatus.Active,
    isSuperAdmin: true,
    isProtected: true, // never deletable
    emailVerified: true,
    mustSetPassword: false,
    passwordHash: await hashPassword(password),
  });

  console.log(`✓ Super Admin created: ${user.email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
