import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Asset } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { HoldingSnapshot } from '../../models/HoldingSnapshot';
import { getCurrentPricesCached } from '../../services/prices';
import { ErrorSchema } from '../../schemas';
import type { AppConfig } from '../../config/env';

const ASSETS: Asset[] = ['SOL', 'SUI'];

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

      const prices = await getCurrentPricesCached();
      const userIds = await Order.distinct('userId');
      const date = new Date().toISOString().slice(0, 10);

      for (const userId of userIds) {
        const docs = await Order.find({ userId }).sort({ timestamp: 1 });
        const held: Record<Asset, number> = { SOL: 0, SUI: 0 };
        for (const d of docs) {
          const o = toOrderDTO(d);
          held[o.asset] += o.side === 'buy' ? o.amount : -o.amount;
        }
        const breakdown = ASSETS.filter((a) => held[a] > 1e-9).map((a) => ({
          asset: a,
          valueUsd: held[a] * (prices[a] ?? 0),
        }));
        const totalValueUsd = breakdown.reduce((s, b) => s + b.valueUsd, 0);
        await HoldingSnapshot.updateOne({ userId, date }, { userId, date, totalValueUsd, breakdown }, { upsert: true });
      }

      return { ok: true, users: userIds.length };
    },
  );
};

export default cronRoutes;
