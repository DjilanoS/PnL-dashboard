import type { WalletDTO } from './wallets';

/** The authenticated user's Discord identity. */
export interface AuthUser {
  /** Discord user id (stable; the login key). */
  discordId: string;
  /** Discord display name (`global_name`, falling back to username). */
  discordUsername: string;
  /** Discord avatar hash, or null for the default avatar. */
  discordAvatar: string | null;
}

/** Response of GET /auth/me — identity plus the user's tracked wallets per chain. */
export interface MeResponse {
  user: AuthUser;
  wallets: {
    sol: WalletDTO[];
    sui: WalletDTO[];
  };
}
