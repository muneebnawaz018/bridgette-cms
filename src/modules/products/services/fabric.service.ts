import 'server-only';
import type { PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Fabric, type FabricDoc } from '../models/fabric.model';
import { Product } from '../models/product.model';
import type { FabricCreateInput, FabricUpdateInput, ListFabricInput } from '../schemas';

/**
 * Fabrics sit beside products in this module and share their permissions: anyone with ProductView
 * reads them, only admins mutate. Deletes are soft, and a fabric still used by a live product is
 * refused outright so no product is left pointing at nothing.
 */

type LeanFabric = FabricDoc & { _id: Types.ObjectId };

function activeMatch(search?: string): Record<string, unknown> {
  const match: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (search?.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    match.$or = [{ name: rx }, { type: rx }];
  }
  return match;
}

// `notes` is projected because the edit dialog is opened from a list row: a field the form can
// edit but the list never returns opens blank, and saving writes that blank back.
const LIST_PROJECTION = { name: 1, gsm: 1, type: 1, notes: 1, createdAt: 1 } as const;

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/** Paginated fabric list (search over name/type), name-sorted. */
export async function listFabrics(
  actor: SessionUser,
  query: ListFabricInput,
): Promise<Paginated<FabricDoc>> {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();

  const stages: PipelineStage[] = [
    { $match: activeMatch(query.search) },
    { $project: LIST_PROJECTION },
  ];
  return aggregatePaginate<FabricDoc>(
    Fabric,
    stages,
    { page: query.page, limit: query.limit },
    { name: 1 },
  );
}

export const FABRIC_OPTIONS_LIMIT = 2000;

/** Lightweight list for the product form's fabric picker. */
export async function listFabricOptions(actor: SessionUser) {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();
  const rows = await Fabric.find({ isDeleted: { $ne: true } })
    .select({ name: 1, gsm: 1, type: 1 })
    .sort({ name: 1 })
    .limit(FABRIC_OPTIONS_LIMIT)
    .lean<LeanFabric[]>();
  return rows.map((f) => ({
    _id: String(f._id),
    name: f.name,
    gsm: f.gsm ?? null,
    type: f.type ?? '',
  }));
}

export async function getFabric(actor: SessionUser, id: string) {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();
  const doc = await Fabric.findOne({ _id: id, isDeleted: { $ne: true } }).lean<FabricDoc>();
  if (!doc) throw new Error('Fabric not found');
  return doc;
}

export async function createFabric(actor: SessionUser, input: FabricCreateInput) {
  assertCan(actor.role, Permission.ProductCreate);
  await connectDb();
  try {
    const doc = await Fabric.create({
      name: input.name,
      gsm: input.gsm,
      type: input.type,
      notes: input.notes,
      createdBy: actor.userId,
    });
    return doc.toObject();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error('A fabric with that name already exists');
    throw err;
  }
}

export async function updateFabric(actor: SessionUser, id: string, input: FabricUpdateInput) {
  assertCan(actor.role, Permission.ProductEdit);
  await connectDb();
  const doc = await Fabric.findById(id);
  if (!doc || doc.isDeleted) throw new Error('Fabric not found');

  if (input.name !== undefined) doc.name = input.name;
  if (input.gsm !== undefined) doc.gsm = input.gsm;
  if (input.type !== undefined) doc.type = input.type;
  if (input.notes !== undefined) doc.notes = input.notes;

  try {
    await doc.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error('A fabric with that name already exists');
    throw err;
  }
  return doc.toObject();
}

/**
 * Soft-delete a fabric. Refused while any live product still points at it — the admin should
 * re-assign those products first, so no catalogue entry is left with a dangling material.
 */
export async function deleteFabric(actor: SessionUser, id: string, reason?: string) {
  assertCan(actor.role, Permission.ProductDelete);
  await connectDb();
  const doc = await Fabric.findById(id);
  if (!doc) throw new Error('Fabric not found');
  if (doc.isDeleted) throw new Error('That fabric is already deleted');

  const inUse = await Product.countDocuments({ fabric: doc._id, isDeleted: { $ne: true } });
  if (inUse > 0) {
    throw new Error(
      `${inUse} ${inUse === 1 ? 'product uses' : 'products use'} this fabric — change them first`,
    );
  }

  doc.isDeleted = true;
  doc.deletedBy = actor.userId as unknown as FabricDoc['deletedBy'];
  doc.deletedAt = new Date();
  doc.deleteReason = reason;
  await doc.save();
  return doc.toObject();
}
