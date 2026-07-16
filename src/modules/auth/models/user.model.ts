import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { Role } from '../rbac';
import { UserStatus } from '../enums';

const { Schema, model, models } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    pendingEmail: { type: String, default: null, lowercase: true, trim: true }, // awaiting OTP verify
    phone: { type: String, trim: true },
    avatarUrl: { type: String, default: null }, // profile photo as a small data: URL (see lib/image/avatar)
    passwordHash: { type: String, default: null }, // null until the user sets a password

    role: { type: String, enum: Object.values(Role), required: true, default: Role.Accountant },
    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.Invited },

    isSuperAdmin: { type: Boolean, default: false },
    isProtected: { type: Boolean, default: false }, // seeded Super Admin — never deletable
    emailVerified: { type: Boolean, default: false },
    mustSetPassword: { type: Boolean, default: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>('User', userSchema);
