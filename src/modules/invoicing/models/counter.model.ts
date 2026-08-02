import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

// One document per (type, period), e.g. _id = "TAX-26-06". Atomically incremented.
const counterSchema = new Schema({
  _id: { type: String, required: true }, // `${TYPE}-${YY}-${MM}`
  seq: { type: Number, required: true, default: 0 },
});

export type CounterDoc = InferSchemaType<typeof counterSchema>;

export const Counter: Model<CounterDoc> = registerModel<CounterDoc>('Counter', counterSchema);
