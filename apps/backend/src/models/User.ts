import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/**
 * One user = one Discord identity. Wallets are tracked separately (see the
 * Wallet model) as portfolio data, not login credentials. `discordId` is
 * unique+sparse so a Discord account backs exactly one user.
 */
const userSchema = new Schema(
  {
    discordId: { type: String, unique: true, sparse: true },
    discordUsername: { type: String },
    discordAvatar: { type: String, default: null },
    // Custom JSON-RPC endpoints (null = use the public mainnet-beta default).
    rpcSol: { type: String, default: null },
    rpcSui: { type: String, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model('User', userSchema);

/** A user's custom RPC overrides (null per chain when using the default). */
export async function getUserRpc(userId: string): Promise<{ sol: string | null; sui: string | null }> {
  const u = await User.findById(userId).select('rpcSol rpcSui').lean();
  return { sol: u?.rpcSol ?? null, sui: u?.rpcSui ?? null };
}
