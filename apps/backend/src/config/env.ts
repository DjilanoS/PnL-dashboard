import { Type, type Static } from '@sinclair/typebox';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

/**
 * Environment schema. Defaults let the server boot in local dev without a
 * full `.env`; production must set MONGODB_URI / JWT_SECRET / HELIUS_API_KEY.
 */
export const envSchema = Type.Object({
  NODE_ENV: Type.String({ default: 'development' }),
  PORT: Type.Number({ default: 3000 }),
  FRONTEND_ORIGIN: Type.String({ default: 'http://localhost:5173' }),

  JWT_SECRET: Type.String({ default: 'dev-secret-change-me' }),
  JWT_EXPIRES_IN: Type.String({ default: '7d' }),

  // --- Discord OAuth (Sign in with Discord) ---
  DISCORD_CLIENT_ID: Type.String({ default: '' }),
  DISCORD_CLIENT_SECRET: Type.String({ default: '' }),
  // Where Discord redirects back. Must EXACTLY match the redirect URI registered
  // in the Discord developer portal (and the backend's actual host:port).
  DISCORD_CALLBACK_URL: Type.String({ default: 'http://localhost:3000/auth/discord/callback' }),
  // The SPA route the backend redirects to after minting the JWT (token in the fragment).
  FRONTEND_AUTH_CALLBACK: Type.String({ default: 'http://localhost:5173/auth/callback' }),

  MONGODB_URI: Type.String({ default: '' }),

  HELIUS_API_KEY: Type.String({ default: '' }),
  SOLANA_RPC_URL: Type.String({ default: '' }),
  SUI_RPC_URL: Type.String({ default: '' }),

  CRON_SECRET: Type.String({ default: 'dev-cron-secret' }),
});

export type AppConfig = Static<typeof envSchema>;

/** Helius Enhanced Transactions API base. */
export const HELIUS_API_BASE = 'https://api-mainnet.helius-rpc.com/v0';

/**
 * Public mainnet-beta RPC endpoints — the default when a user hasn't set their
 * own RPC in Settings. Users bring their own (e.g. Helius) for better limits.
 */
export const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
export const DEFAULT_SUI_RPC = getJsonRpcFullnodeUrl('mainnet');

/**
 * Build an effective config that applies a user's custom RPC overrides. When a
 * user hasn't set their own RPC for a chain, fall back to the operator's
 * configured endpoint (the env RPC, or the Helius-derived URL for Solana) and
 * only then to the public mainnet-beta default — so a default user still gets
 * the operator's reliable RPC instead of the rate-limited public one.
 */
export function configWithUserRpc(
  config: AppConfig,
  rpc: { sol?: string | null; sui?: string | null },
): AppConfig {
  return {
    ...config,
    SOLANA_RPC_URL: rpc.sol?.trim() || solanaRpcUrl(config),
    SUI_RPC_URL: rpc.sui?.trim() || config.SUI_RPC_URL || DEFAULT_SUI_RPC,
  };
}

/**
 * The raw Helius API key. Tolerates a full RPC URL being pasted into
 * HELIUS_API_KEY (e.g. https://mainnet.helius-rpc.com/?api-key=…) by
 * extracting the api-key query parameter.
 */
export function heliusApiKey(config: AppConfig): string {
  const v = config.HELIUS_API_KEY.trim();
  if (!v) return '';
  if (v.includes('api-key=')) {
    try {
      return new URL(v).searchParams.get('api-key') ?? v;
    } catch {
      return v.match(/api-key=([^&\s]+)/)?.[1] ?? v;
    }
  }
  return v;
}

/** Resolve the Solana RPC URL, deriving from the Helius key when not set. */
export function solanaRpcUrl(config: AppConfig): string {
  if (config.SOLANA_RPC_URL) return config.SOLANA_RPC_URL;
  const key = heliusApiKey(config);
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`;
  return 'https://api.mainnet-beta.solana.com';
}
