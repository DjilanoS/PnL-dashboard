import { Type } from '@sinclair/typebox';

/** Shared TypeBox schemas reused across route modules. */
export const ChainSchema = Type.Union([Type.Literal('sol'), Type.Literal('sui')]);
/** Display ticker (any token symbol; was a SOL/SUI union). */
export const AssetSchema = Type.String();
export const SideSchema = Type.Union([Type.Literal('buy'), Type.Literal('sell')]);

/** Denormalized token metadata (matches @pnl/types TokenMeta). */
export const TokenMetaSchema = Type.Object({
  chain: ChainSchema,
  address: Type.String(),
  symbol: Type.String(),
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  decimals: Type.Number(),
});

/** One token held on-chain (matches @pnl/types OwnedAsset). */
export const OwnedAssetSchema = Type.Composite([
  TokenMetaSchema,
  Type.Object({
    balance: Type.Number(),
    priceUsd: Type.Union([Type.Number(), Type.Null()]),
  }),
]);

export const AssetsScanResponseSchema = Type.Object({ assets: Type.Array(OwnedAssetSchema) });
export const TokenLookupResponseSchema = Type.Object({
  token: TokenMetaSchema,
  priceUsd: Type.Union([Type.Number(), Type.Null()]),
});
export const OrderSourceSchema = Type.Union([
  Type.Literal('manual'),
  Type.Literal('tx'),
  Type.Literal('scan'),
]);

export const QuoteSchema = Type.Object({
  symbol: Type.String(),
  amount: Type.Number(),
});

export const ErrorSchema = Type.Object({ error: Type.String() });

/** Order DTO (matches @pnl/types Order). */
export const OrderDtoSchema = Type.Object({
  id: Type.String(),
  chain: ChainSchema,
  address: Type.String(),
  asset: AssetSchema,
  decimals: Type.Number(),
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  side: SideSchema,
  amount: Type.Number(),
  priceUsd: Type.Number(),
  quote: Type.Optional(QuoteSchema),
  feeUsd: Type.Number(),
  gasUsd: Type.Number(),
  txSignature: Type.Union([Type.String(), Type.Null()]),
  timestamp: Type.String(),
  source: OrderSourceSchema,
  createdAt: Type.String(),
});

/** Body for creating a manual order. */
export const ManualOrderSchema = Type.Object({
  chain: ChainSchema,
  // Token identity; address defaults to the chain's native coin server-side.
  address: Type.Optional(Type.String()),
  asset: AssetSchema,
  decimals: Type.Optional(Type.Number({ default: 9 })),
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  side: SideSchema,
  amount: Type.Number({ exclusiveMinimum: 0 }),
  priceUsd: Type.Number({ minimum: 0 }),
  quote: Type.Optional(QuoteSchema),
  feeUsd: Type.Number({ minimum: 0, default: 0 }),
  gasUsd: Type.Number({ minimum: 0, default: 0 }),
  timestamp: Type.String(),
});

/** Cash adjustment DTO (matches @pnl/types CashAdjustment). */
export const CashAdjustmentDtoSchema = Type.Object({
  id: Type.String(),
  amount: Type.Number(),
  note: Type.Optional(Type.String()),
  timestamp: Type.String(),
  createdAt: Type.String(),
});

/** Body for creating a cash adjustment (signed amount; + deposit, − withdrawal). */
export const CashAdjustmentInputSchema = Type.Object({
  amount: Type.Number(),
  note: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.String()),
});

/** Wallet DTO (matches @pnl/types WalletDTO). */
export const WalletDtoSchema = Type.Object({
  id: Type.String(),
  chain: ChainSchema,
  address: Type.String(),
  label: Type.Union([Type.String(), Type.Null()]),
  verifiedAt: Type.String(),
});

/** The user's tracked wallets grouped by chain (matches @pnl/types WalletsResponse). */
export const WalletsResponseSchema = Type.Object({
  sol: Type.Array(WalletDtoSchema),
  sui: Type.Array(WalletDtoSchema),
});

/** RPC endpoint settings, per chain (matches @pnl/types RpcSettings). */
export const RpcChainSettingSchema = Type.Object({
  url: Type.Union([Type.String(), Type.Null()]),
  default: Type.String(),
});
export const RpcSettingsSchema = Type.Object({
  sol: RpcChainSettingSchema,
  sui: RpcChainSettingSchema,
});
export const RpcHealthResponseSchema = Type.Object({
  ok: Type.Boolean(),
  latencyMs: Type.Union([Type.Number(), Type.Null()]),
});

/** Discord identity DTO (matches @pnl/types AuthUser). */
export const AuthUserSchema = Type.Object({
  discordId: Type.String(),
  discordUsername: Type.String(),
  discordAvatar: Type.Union([Type.String(), Type.Null()]),
});

/** Response of GET /auth/me (matches @pnl/types MeResponse). */
export const MeResponseSchema = Type.Object({
  user: AuthUserSchema,
  wallets: WalletsResponseSchema,
});

/** Per-token PnL (matches @pnl/types AssetPnl). */
export const AssetPnlSchema = Type.Object({
  chain: ChainSchema,
  address: Type.String(),
  asset: AssetSchema,
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  decimals: Type.Number(),
  held: Type.Number(),
  avgCost: Type.Number(),
  costBasis: Type.Number(),
  currentPrice: Type.Number(),
  marketValue: Type.Number(),
  realized: Type.Number(),
  unrealized: Type.Number(),
  invested: Type.Number(),
  avgBuy: Type.Number(),
  avgSell: Type.Number(),
});

export const PnlSummarySchema = Type.Object({
  realized: Type.Number(),
  unrealized: Type.Number(),
  total: Type.Number(),
  invested: Type.Number(),
  roi: Type.Number(),
  perAsset: Type.Array(AssetPnlSchema),
});

export const HoldingSchema = Type.Object({
  chain: ChainSchema,
  address: Type.String(),
  asset: AssetSchema,
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  decimals: Type.Number(),
  walletBalance: Type.Union([Type.Number(), Type.Null()]),
  ledgerQty: Type.Number(),
  avgCost: Type.Number(),
  costBasis: Type.Number(),
  currentPrice: Type.Number(),
  valueUsd: Type.Number(),
  realized: Type.Number(),
  unrealized: Type.Number(),
  allocation: Type.Number(),
});

export const HoldingsResponseSchema = Type.Object({
  holdings: Type.Array(HoldingSchema),
  totalValueUsd: Type.Number(),
});

export const NavPointSchema = Type.Object({
  date: Type.String(),
  totalValueUsd: Type.Number(),
  breakdown: Type.Array(Type.Object({ chain: ChainSchema, asset: AssetSchema, valueUsd: Type.Number() })),
});

export const TimeseriesResponseSchema = Type.Object({
  range: Type.Union([
    Type.Literal('7d'),
    Type.Literal('30d'),
    Type.Literal('90d'),
    Type.Literal('1y'),
    Type.Literal('all'),
  ]),
  points: Type.Array(NavPointSchema),
});

/** A parsed-order preview (matches @pnl/types ParsedOrderPreview). */
export const ParsedPreviewSchema = Type.Object({
  chain: ChainSchema,
  address: Type.String(),
  asset: AssetSchema,
  decimals: Type.Number(),
  name: Type.Optional(Type.String()),
  image: Type.Optional(Type.String()),
  side: SideSchema,
  amount: Type.Number(),
  priceUsd: Type.Number(),
  quote: Type.Optional(QuoteSchema),
  feeUsd: Type.Number(),
  gasUsd: Type.Number(),
  timestamp: Type.String(),
  txSignature: Type.String(),
  explorerUrl: Type.String(),
});
