import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/** Single-use challenge for proving wallet ownership, auto-expired by a TTL index. */
const authNonceSchema = new Schema({
  // The user the challenge was issued to, so one user's pending nonce for an
  // address can't be read or clobbered by another user requesting the same one.
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  chain: { type: String, enum: ['sol', 'sui'], required: true },
  address: { type: String, required: true },
  nonce: { type: String, required: true },
  // Discriminates flows so a nonce minted for one purpose can't be replayed in
  // another. Currently only add-wallet exists (wallet login was removed).
  purpose: { type: String, enum: ['add-wallet'], required: true, default: 'add-wallet' },
  expiresAt: { type: Date, required: true },
});

authNonceSchema.index({ userId: 1, address: 1, chain: 1 });
authNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthNonceDoc = InferSchemaType<typeof authNonceSchema>;

export const AuthNonce: Model<AuthNonceDoc> =
  (mongoose.models.AuthNonce as Model<AuthNonceDoc>) ??
  mongoose.model('AuthNonce', authNonceSchema);
