import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

// One document per (type, period), e.g. _id = "TAX-26-06". Atomically incremented.
const counterSchema = new Schema({
  _id: { type: String, required: true }, // `${TYPE}-${YY}-${MM}`
  seq: { type: Number, required: true, default: 0 },
});

export type CounterDoc = InferSchemaType<typeof counterSchema>;

export const Counter: Model<CounterDoc> =
  (models.Counter as Model<CounterDoc>) ?? model<CounterDoc>('Counter', counterSchema);
