import { z } from 'zod';

/**
 * A shipment is a small, whole record — a tracking number, an agent, and two dates — so there is
 * one schema for both writing it and editing it. The dialog always submits all four fields, and
 * the update applies all four, which is what lets a blank ETA actually clear a stored one rather
 * than being read as "leave it alone".
 */

const TRACKING_MAX = 120;
const AGENT_MAX = 120;

/** A calendar day as the date picker emits it. Same shape the invoice filters use. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Not a real date');

export const shipmentInputSchema = z
  .object({
    trackingId: z
      .string()
      .trim()
      .min(1, 'A tracking ID is required')
      .max(TRACKING_MAX, 'That tracking ID is too long'),
    agent: z
      .string()
      .trim()
      .min(1, 'A shipping agent is required')
      .max(AGENT_MAX, 'That name is too long'),
    shippedAt: dateOnly,
    // Blank is a real answer here — the agent has not given a date yet — so an empty string is
    // accepted and normalised away rather than rejected.
    eta: dateOnly
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
  })
  // Both are bare YYYY-MM-DD, so a string compare is a date compare.
  .refine((v) => !v.eta || v.eta >= v.shippedAt, {
    message: 'The ETA cannot be before the shipping date',
    path: ['eta'],
  });

export type ShipmentInput = z.infer<typeof shipmentInputSchema>;
