import mongoose, {
  Schema,
  type HydratedDocument,
  type InferSchemaType,
  type Model,
} from 'mongoose';
import type { Chain, WalletDTO } from '@pnl/types';

/**
 * A wallet a user added to their per-chain "your wallets" list, proven by a
 * one-time ownership signature. Unique per (user, chain, address): a user can't
 * add the same wallet twice, but two users may track the same public address
 * (it's public data — no global uniqueness like the old wallet-login model).
 */
const walletSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    chain: { type: String, enum: ['sol', 'sui'], required: true },
    address: { type: String, required: true },
    label: { type: String, default: null },
    verifiedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

walletSchema.index({ userId: 1, chain: 1, address: 1 }, { unique: true });
walletSchema.index({ userId: 1, chain: 1 });

export type WalletDoc = InferSchemaType<typeof walletSchema>;

export const Wallet: Model<WalletDoc> =
  (mongoose.models.Wallet as Model<WalletDoc>) ?? mongoose.model('Wallet', walletSchema);

export function toWalletDTO(doc: HydratedDocument<WalletDoc>): WalletDTO {
  return {
    id: String(doc._id),
    chain: doc.chain as Chain,
    address: doc.address,
    label: doc.label ?? null,
    verifiedAt: doc.verifiedAt.toISOString(),
  };
}
