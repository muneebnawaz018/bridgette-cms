import 'dotenv/config';
import mongoose from 'mongoose';
import { hashPassword, verifyPassword } from '../modules/auth/password';

/**
 * Point the existing protected Super Admin at the credentials in .env.
 *
 * `npm run seed` deliberately does nothing once a Super Admin exists, so changing
 * SUPER_ADMIN_EMAIL/PASSWORD alone never reaches the database. This reconciles the live
 * record with the env without creating a second Super Admin.
 */
async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';
  if (!email || !password) throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required');

  await mongoose.connect(process.env.MONGODB_URI!);
  const users = mongoose.connection.db!.collection('users');

  const admin = await users.findOne({ isSuperAdmin: true });
  if (!admin) throw new Error('No Super Admin found — run `npm run seed` first');
  console.log(`current Super Admin: ${admin.email}`);

  // Refuse if some other account already holds the target address.
  const clash = await users.findOne({ email, _id: { $ne: admin._id } });
  if (clash) throw new Error(`${email} is already used by another account — aborting`);

  const passwordHash = await hashPassword(password);
  await users.updateOne(
    { _id: admin._id },
    {
      $set: {
        email,
        name,
        passwordHash,
        status: 'active',
        emailVerified: true,
        mustSetPassword: false,
        pendingEmail: null,
        updatedAt: new Date(),
      },
    },
  );

  // Read back and prove the stored hash actually matches the intended password.
  const after = await users.findOne({ _id: admin._id });
  const ok = await verifyPassword(password, after!.passwordHash as string);
  console.log(`updated Super Admin: ${after!.email}`);
  console.log(`  status=${after!.status} verified=${after!.emailVerified} mustSetPassword=${after!.mustSetPassword}`);
  console.log(`  password check: ${ok ? 'PASS — stored hash matches the env password' : 'FAIL'}`);
  console.log(`  total users: ${await users.countDocuments({})}`);

  await mongoose.disconnect();
}
main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
