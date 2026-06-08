import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import type { Chain, ParsedOrderPreview } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { getUserRpc } from '../../models/User';
import { ChainSchema, ErrorSchema, OrderDtoSchema, ParsedPreviewSchema } from '../../schemas';
import { parseSolanaSignature, scanSolana } from '../../services/solanaParser';
import { parseSuiDigest, scanSui } from '../../services/suiParser';
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
          asset: preview.asset,
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
