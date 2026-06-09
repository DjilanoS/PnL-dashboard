import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import { tokenKey, type Chain, type OwnedAsset, type ParsedOrderPreview, type TokenRef } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { Wallet } from '../../models/Wallet';
import { getUserRpc } from '../../models/User';
import {
  AssetsScanResponseSchema,
  ChainSchema,
  ErrorSchema,
  OrderDtoSchema,
  ParsedPreviewSchema,
  TokenLookupResponseSchema,
} from '../../schemas';
import { getSolanaAsset, getSolanaAssetsByOwner, parseSolanaSignature, scanSolana } from '../../services/solanaParser';
import { getSuiAssetsByOwner, getSuiCoinMeta, parseSuiDigest, scanSui } from '../../services/suiParser';
import { getCurrentPriceForToken, getCurrentPricesForTokens } from '../../services/prices';
import { configWithUserRpc, type AppConfig } from '../../config/env';

const txRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.authenticate);

  const config = app.config as AppConfig;

  // Effective config for this request, with the user's custom RPC applied.
  const cfgFor = async (userId: string): Promise<AppConfig> =>
    configWithUserRpc(config, await getUserRpc(userId));

  async function parse(
    cfg: AppConfig,
    chain: Chain,
    urlOrSig: string,
    address?: string,
  ): Promise<ParsedOrderPreview | null> {
    return chain === 'sol'
      ? parseSolanaSignature(cfg, urlOrSig, address)
      : parseSuiDigest(cfg, urlOrSig, address);
  }

  // Preview a single tx (not persisted). `address` is optional — defaults to the
  // tx signer, so trades from any wallet/dex/exchange can be logged.
  app.post(
    '/parse',
    {
      schema: {
        body: Type.Object({
          chain: ChainSchema,
          urlOrSig: Type.String({ minLength: 1 }),
          address: Type.Optional(Type.String()),
        }),
        response: { 200: Type.Object({ preview: ParsedPreviewSchema }), 422: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, urlOrSig, address } = req.body;
      const preview = await parse(await cfgFor(req.user.sub), chain, urlOrSig, address);
      if (!preview) {
        return reply.code(422).send({ error: 'No SOL/SUI trade found in that transaction' });
      }
      return { preview };
    },
  );

  // Scan a wallet's recent swaps (not persisted). The caller supplies the
  // address (one of "your wallets", or any address via the dialog's escape hatch).
  app.post(
    '/scan',
    {
      schema: {
        body: Type.Object({
          chain: ChainSchema,
          address: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
        response: { 200: Type.Object({ candidates: Type.Array(ParsedPreviewSchema) }), 400: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, limit } = req.body;
      const wallet = req.body.address?.trim();
      if (!wallet) {
        return reply.code(400).send({ error: `Provide a ${chain.toUpperCase()} wallet address to scan` });
      }

      const cfg = await cfgFor(req.user.sub);
      const candidates =
        chain === 'sol' ? await scanSolana(cfg, wallet, limit) : await scanSui(cfg, wallet, limit);
      return { candidates };
    },
  );

  // Fetch the tokens the user holds across ALL their tracked wallets on a chain
  // (Solana via Helius DAS getAssetsByOwner; Sui via getAllBalances + metadata).
  app.post(
    '/assets',
    {
      schema: {
        body: Type.Object({ chain: ChainSchema }),
        response: { 200: AssetsScanResponseSchema, 400: ErrorSchema, 502: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain } = req.body;
      const userId = new mongoose.Types.ObjectId(req.user.sub);
      const wallets = await Wallet.find({ userId, chain });
      if (wallets.length === 0) {
        return reply
          .code(400)
          .send({ error: `Add a ${chain.toUpperCase()} wallet first to scan your tokens` });
      }

      const cfg = await cfgFor(req.user.sub);
      const fetchOne = chain === 'sol' ? getSolanaAssetsByOwner : getSuiAssetsByOwner;
      let firstError: string | null = null;
      const perWallet = await Promise.all(
        wallets.map((w) =>
          fetchOne(cfg, w.address).catch((e: unknown) => {
            if (!firstError) firstError = e instanceof Error ? e.message : String(e);
            return [] as OwnedAsset[];
          }),
        ),
      );

      // Merge/dedupe by address, summing balances across wallets.
      const merged = new Map<string, OwnedAsset>();
      for (const assets of perWallet) {
        for (const a of assets) {
          const existing = merged.get(a.address);
          if (existing) {
            existing.balance += a.balance;
            existing.image = existing.image ?? a.image;
            existing.name = existing.name ?? a.name;
            existing.priceUsd = existing.priceUsd ?? a.priceUsd;
          } else {
            merged.set(a.address, { ...a });
          }
        }
      }

      // Surface a real upstream failure instead of a misleading "no tokens found".
      const failure: string | null = firstError;
      if (merged.size === 0 && failure) {
        return reply.code(502).send({ error: failure });
      }

      // Fill missing prices via DefiLlama (all Sui tokens; SOL tokens DAS didn't price).
      const need: TokenRef[] = [...merged.values()]
        .filter((a) => a.priceUsd == null)
        .map((a) => ({ chain: a.chain, address: a.address }));
      if (need.length > 0) {
        const prices = await getCurrentPricesForTokens(need);
        for (const a of merged.values()) {
          if (a.priceUsd == null) a.priceUsd = prices[tokenKey(a.chain, a.address)] ?? null;
        }
      }

      const assets = [...merged.values()].sort(
        (x, y) => y.balance * (y.priceUsd ?? 0) - x.balance * (x.priceUsd ?? 0),
      );
      return { assets };
    },
  );

  // Look up one token's metadata by address (Solana via DAS getAsset; Sui via getCoinMetadata).
  app.post(
    '/token',
    {
      schema: {
        body: Type.Object({ chain: ChainSchema, address: Type.String({ minLength: 1 }) }),
        response: { 200: TokenLookupResponseSchema, 422: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain } = req.body;
      const address = req.body.address.trim();
      const cfg = await cfgFor(req.user.sub);

      if (chain === 'sol') {
        const found = await getSolanaAsset(cfg, address);
        if (!found) return reply.code(422).send({ error: 'Token not found' });
        const priceUsd = found.priceUsd ?? (await getCurrentPriceForToken('sol', found.token.address));
        return { token: found.token, priceUsd };
      }

      const token = await getSuiCoinMeta(cfg, address);
      if (!token) return reply.code(422).send({ error: 'Token not found' });
      const priceUsd = await getCurrentPriceForToken('sui', token.address);
      return { token, priceUsd };
    },
  );

  // Import a parsed trade into the ledger (idempotent on txSignature).
  app.post(
    '/import',
    {
      schema: {
        body: Type.Object({
          chain: ChainSchema,
          urlOrSig: Type.Optional(Type.String()),
          candidate: Type.Optional(ParsedPreviewSchema),
          address: Type.Optional(Type.String()),
        }),
        response: { 200: OrderDtoSchema, 422: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, urlOrSig, candidate, address } = req.body;

      const preview =
        candidate ?? (urlOrSig ? await parse(await cfgFor(req.user.sub), chain, urlOrSig, address) : null);
      if (!preview) return reply.code(422).send({ error: 'Nothing to import' });

      const userId = new mongoose.Types.ObjectId(req.user.sub);
      const existing = await Order.findOne({ userId, txSignature: preview.txSignature });
      if (existing) return toOrderDTO(existing);

      const source = candidate ? 'scan' : 'tx';
      try {
        const doc = await Order.create({
          userId,
          chain: preview.chain,
          address: preview.address,
          asset: preview.asset,
          decimals: preview.decimals,
          tokenName: preview.name,
          tokenImage: preview.image,
          side: preview.side,
          amount: preview.amount,
          priceUsd: preview.priceUsd,
          quote: preview.quote,
          feeUsd: preview.feeUsd,
          gasUsd: preview.gasUsd,
          txSignature: preview.txSignature,
          timestamp: new Date(preview.timestamp),
          source,
        });
        return toOrderDTO(doc);
      } catch (err) {
        // Duplicate txSignature (race) → return the existing row.
        if ((err as { code?: number }).code === 11000) {
          const dup = await Order.findOne({ userId, txSignature: preview.txSignature });
          if (dup) return toOrderDTO(dup);
        }
        throw err;
      }
    },
  );
};

export default txRoutes;
