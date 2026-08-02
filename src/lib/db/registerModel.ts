import mongoose, { type Model, type Schema } from 'mongoose';

/*
 * `schema` is deliberately typed `unknown` and cast, not `Schema<...>`. Our schemas are inferred
 * structurally (InferSchemaType reads them back), and asking TS to check one against Schema's
 * generics here made it re-expand every field of every model at each call site — enough to
 * exhaust tsc's heap. The cast costs nothing: mongoose validates the schema at runtime, and the
 * document type comes from the explicit <T> each caller passes.
 */

/**
 * Register a Mongoose model once, and re-register it in dev when its schema module reloads.
 *
 * The usual `models.X ?? model('X', schema)` has a trap in a dev server: mongoose keeps its model
 * registry on the cached connection, which survives HMR. Edit a schema — add a field — and the
 * module re-evaluates, finds the OLD model still registered, and returns it. Mongoose then strips
 * the new field from every write, silently, until someone restarts the process. That is how
 * `addressParts.country` went missing on customers saved before a restart: the form sent it, the
 * API validated it, and the stale model dropped it on the floor.
 *
 * So in dev the old registration is deleted first and the current schema registered in its place.
 * In production modules evaluate once, the branch never runs, and this is exactly the old code.
 */
export function registerModel<T>(name: string, schema: unknown): Model<T> {
  if (process.env.NODE_ENV !== 'production' && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
  return (mongoose.models[name] ?? mongoose.model(name, schema as Schema)) as unknown as Model<T>;
}
