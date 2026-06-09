import mongoose, { Schema, Types, type HydratedDocument, type Model } from 'mongoose';
import { NATIVE_SOL_MINT, NATIVE_SUI_TYPE, type Order as OrderDTO } from '@pnl/types';

/**
 * The immutable order ledger. PnL is always derived by replaying these rows —
 * never stored mutably. Money is stored as Decimal128 for precision; the TS
 * money fields are typed `number` so create() accepts numbers and reads go
 * through {@link d2n} (which handles the runtime Decimal128).
 */
export interface OrderDoc {
  userId: Types.ObjectId;
  chain: 'sol' | 'sui';
  /** Token address (SPL mint / Sui coin type). Absent on legacy native rows. */
  address?: string;
  /** Display ticker. Was 'SOL'|'SUI'; now any token symbol. */
  asset: string;
  /** On-chain decimals; defaults to 9 (legacy native rows). */
  decimals?: number;
  tokenName?: string | null;
  tokenImage?: string | null;
  side: 'buy' | 'sell';
  amount: number;
  priceUsd: number;
  quote?: { symbol: string; amount: number };
  feeUsd: number;
  gasUsd: number;
  txSignature?: string | null;
  timestamp: Date;
  source: 'manual' | 'tx' | 'scan';
  createdAt: Date;
}

// Note: schema is intentionally untyped (no <OrderDoc> generic) so Decimal128
// can back the number-typed money fields; the model below is typed for reads.
const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chain: { type: String, enum: ['sol', 'sui'], required: true },
    // Token address (SPL mint / Sui coin type). Required for new rows; legacy
    // native rows lack it and resolve to the canonical address at read time.
    address: { type: String, default: undefined },
    asset: { type: String, required: true },
    decimals: { type: Number, default: 9 },
    tokenName: { type: String, default: undefined },
    tokenImage: { type: String, default: undefined },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
    priceUsd: { type: Schema.Types.Decimal128, required: true },
    quote: {
      type: { symbol: String, amount: Schema.Types.Decimal128 },
      _id: false,
      default: undefined,
    },
    feeUsd: { type: Schema.Types.Decimal128, default: 0 },
    gasUsd: { type: Schema.Types.Decimal128, default: 0 },
    txSignature: { type: String, unique: true, sparse: true, default: undefined },
    timestamp: { type: Date, required: true },
    source: { type: String, enum: ['manual', 'tx', 'scan'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

orderSchema.index({ userId: 1, timestamp: -1 });

export const Order: Model<OrderDoc> =
  (mongoose.models.Order as Model<OrderDoc>) ?? mongoose.model('Order', orderSchema);

/** Decimal128 (or number) → JS number. */
function d2n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return parseFloat(String(v));
}

/** Token address for a row, resolving legacy native rows to the canonical address. */
function addressFor(doc: OrderDoc): string {
  if (doc.address) return doc.address;
  return doc.chain === 'sol' ? NATIVE_SOL_MINT : NATIVE_SUI_TYPE;
}

export function toOrderDTO(doc: HydratedDocument<OrderDoc>): OrderDTO {
  return {
    id: String(doc._id),
    chain: doc.chain,
    address: addressFor(doc),
    asset: doc.asset,
    decimals: doc.decimals ?? 9,
    name: doc.tokenName ?? undefined,
    image: doc.tokenImage ?? undefined,
    side: doc.side,
    amount: d2n(doc.amount),
    priceUsd: d2n(doc.priceUsd),
    quote: doc.quote?.symbol
      ? { symbol: doc.quote.symbol, amount: d2n(doc.quote.amount) }
      : undefined,
    feeUsd: d2n(doc.feeUsd),
    gasUsd: d2n(doc.gasUsd),
    txSignature: doc.txSignature ?? null,
    timestamp: doc.timestamp.toISOString(),
    source: doc.source,
    createdAt: doc.createdAt.toISOString(),
  };
}
