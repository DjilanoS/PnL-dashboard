import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { CashAdjustment as CashAdjustmentDTO } from '@pnl/types';

/**
 * A manual USDC balance adjustment (deposit/withdrawal that isn't a trade).
 * Amount is Decimal128 for precision; signed (+ deposit, − withdrawal).
 */
export interface CashAdjustmentDoc {
  userId: Types.ObjectId;
  amount: number;
  note?: string | null;
  timestamp: Date;
  createdAt: Date;
}

const cashAdjustmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    note: { type: String, default: undefined },
    timestamp: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

cashAdjustmentSchema.index({ userId: 1, timestamp: -1 });

export const CashAdjustment: Model<CashAdjustmentDoc> =
  (mongoose.models.CashAdjustment as Model<CashAdjustmentDoc>) ??
  mongoose.model('CashAdjustment', cashAdjustmentSchema);

/** Decimal128 (or number) → JS number. */
function d2n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return parseFloat(String(v));
}

export function toCashAdjustmentDTO(doc: HydratedDocument<CashAdjustmentDoc>): CashAdjustmentDTO {
  return {
    id: String(doc._id),
    amount: d2n(doc.amount),
    note: doc.note ?? undefined,
    timestamp: doc.timestamp.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}
