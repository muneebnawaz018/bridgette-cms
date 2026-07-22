/**
 * Create the Super Admin, or bring the existing one in line with the chosen env file.
 *
 *   npm run seed:dev    # seeds the dev database   (.env.development)
 *   npm run seed:prod   # seeds the prod database  (.env.prod)
 *
 * The target is the first CLI arg (`dev` — default — or `prod`), which selects the env file
 * that MONGODB_URI + SUPER_ADMIN_* are read from. Dev and prod are separate Atlas clusters, so
 * this is the guard against seeding one while pointed at the other.
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

// Which environment to seed. `prod` loads .env.prod (production cluster + prod Super Admin);
// anything else (default) loads the dev files. dotenv keeps the FIRST value it sees, so the
// target file is listed first and .env is only a last-resort fallback — the prod and dev
// clusters never cross.
const TARGET = process.argv[2] === 'prod' ? 'prod' : 'dev';
if (TARGET === 'prod') {
  dotenv.config({ path: '.env.prod' });
} else {
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env.development' });
}
dotenv.config({ path: '.env' });

async function main() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';
  // Optional: left undefined the phone is simply not written, so an existing number is not
  // wiped by running the seed without the variable set.
  const phone = process.env.SUPER_ADMIN_PHONE?.trim() || undefined;

  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
  }

  // Show the target before writing (password masked), so seeding the wrong cluster is caught.
  console.log(`Seeding [${TARGET}]: ${email} @ ${uri.replace(/\/\/[^@]*@/, '//***:***@')}`);

  await mongoose.connect(uri);

  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ isSuperAdmin: true });

  if (!existing) {
    const created = await User.create({
      name,
      email,
      ...(phone ? { phone } : null),
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
    throw new Error(
      `${email} already belongs to another account — change SUPER_ADMIN_EMAIL or remove that user`,
    );
  }

  const emailChanged = existing.email !== email;
  existing.set({
    name,
    email,
    ...(phone ? { phone } : null),
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
  console.log(
    `  status=${after!.status} verified=${after!.emailVerified} mustSetPassword=${after!.mustSetPassword}`,
  );
  console.log(`  phone=${after!.phone ?? '(not set)'}`);
  console.log(
    `  password check: ${matches ? 'PASS — stored hash matches the env password' : 'FAIL'}`,
  );
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
