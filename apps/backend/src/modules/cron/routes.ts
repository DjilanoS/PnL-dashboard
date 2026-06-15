import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { tokenKey, type Chain } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { HoldingSnapshot } from '../../models/HoldingSnapshot';
import { CashAdjustment } from '../../models/CashAdjustment';
import { getCurrentPricesCached } from '../../services/prices';
import { adjustmentsSumAt, buildCashTimeline, usdcBalanceAt } from '../../services/cash';
import { ErrorSchema } from '../../schemas';
import type { AppConfig } from '../../config/env';

/**
 * Daily NAV snapshot. Secured by CRON_SECRET (Vercel Cron sends it as a Bearer
 * token). Writes one HoldingSnapshot per user for today (durable history; the
 * chart computes live, this is a persistent record).
 */
const cronRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const config = app.config as AppConfig;

  // GET because Vercel Cron triggers jobs with a GET request.
  app.get(
    '/cron/snapshot',
    {
      schema: {
        response: {
          200: Type.Object({ ok: Type.Boolean(), users: Type.Number() }),
          401: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      if (req.headers.authorization !== `Bearer ${config.CRON_SECRET}`) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const userIds = await Order.distinct('userId');
      const date = new Date().toISOString().slice(0, 10);

      for (const userId of userIds) {
        const docs = await Order.find({ userId }).sort({ timestamp: 1 });
        // Accumulate held quantity per token (display symbol: latest wins).
        const held = new Map<string, { chain: Chain; address: string; asset: string; qty: number }>();
        for (const d of docs) {
          const o = toOrderDTO(d);
          const key = tokenKey(o.chain, o.address);
          const delta = o.side === 'buy' ? o.amount : -o.amount;
          const cur = held.get(key);
          if (cur) {
            cur.qty += delta;
            cur.asset = o.asset;
          } else {
            held.set(key, { chain: o.chain, address: o.address, asset: o.asset, qty: delta });
          }
        }

        const active = [...held.values()].filter((h) => h.qty > 1e-9);
        const prices = await getCurrentPricesCached(
          active.map((h) => ({ chain: h.chain, address: h.address })),
        );
        const breakdown = active.map((h) => ({
          asset: h.asset,
          valueUsd: h.qty * (prices[tokenKey(h.chain, h.address)] ?? 0),
        }));

        // USDC cash: trade-derived balance + manual adjustments.
        const entries = docs.map((d) => {
          const o = toOrderDTO(d);
          return {
            chain: o.chain,
            address: o.address,
            asset: o.asset,
            decimals: o.decimals,
            name: o.name,
            image: o.image,
            side: o.side,
            amount: o.amount,
            priceUsd: o.priceUsd,
            feeUsd: o.feeUsd,
            gasUsd: o.gasUsd,
            timestamp: o.timestamp,
          };
        });
        const adjDocs = await CashAdjustment.find({ userId });
        const adjustments = adjDocs.map((a) => ({
          ms: a.timestamp.getTime(),
          amount: Number.parseFloat(String(a.amount)),
        }));
        const usdc = usdcBalanceAt(buildCashTimeline(entries)) + adjustmentsSumAt(adjustments);
        if (usdc > 0.01) breakdown.push({ asset: 'USDC', valueUsd: usdc });

        const totalValueUsd = breakdown.reduce((s, b) => s + b.valueUsd, 0);
        await HoldingSnapshot.updateOne({ userId, date }, { userId, date, totalValueUsd, breakdown }, { upsert: true });
      }

      return { ok: true, users: userIds.length };
    },
  );
};

export default cronRoutes;
