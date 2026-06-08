import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import type { Holding, NavRange } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { Wallet } from '../../models/Wallet';
import { getUserRpc } from '../../models/User';
import { computePnl, type LedgerEntry } from '../../services/pnlEngine';
import { computeNavSeries } from '../../services/nav';
import { getCurrentPricesCached } from '../../services/prices';
import { getWalletBalances } from '../../services/balances';
import { HoldingsResponseSchema, PnlSummarySchema, TimeseriesResponseSchema } from '../../schemas';
import { configWithUserRpc, type AppConfig } from '../../config/env';

const RangeSchema = Type.Union([
  Type.Literal('7d'),
  Type.Literal('30d'),
  Type.Literal('90d'),
  Type.Literal('1y'),
  Type.Literal('all'),
]);

const portfolioRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.authenticate);
  const config = app.config as AppConfig;

  async function loadEntries(userId: string): Promise<LedgerEntry[]> {
    const docs = await Order.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ timestamp: 1 });
    return docs.map((d) => {
      const o = toOrderDTO(d);
      return {
        asset: o.asset,
        side: o.side,
        amount: o.amount,
        priceUsd: o.priceUsd,
        feeUsd: o.feeUsd,
        gasUsd: o.gasUsd,
        timestamp: o.timestamp,
      };
    });
  }

  app.get('/pnl/summary', { schema: { response: { 200: PnlSummarySchema } } }, async (req) => {
    const [entries, prices] = await Promise.all([loadEntries(req.user.sub), getCurrentPricesCached()]);
    return computePnl(entries, prices);
  });

  app.get('/holdings', { schema: { response: { 200: HoldingsResponseSchema } } }, async (req) => {
    const userId = new mongoose.Types.ObjectId(req.user.sub);
    const [entries, prices, walletDocs, rpc] = await Promise.all([
      loadEntries(req.user.sub),
      getCurrentPricesCached(),
      Wallet.find({ userId }),
      getUserRpc(req.user.sub),
    ]);
    // Live balances aggregate across all tracked wallets per chain, using the
    // user's own RPC endpoint (or the mainnet-beta default).
    const balances = await getWalletBalances(
      configWithUserRpc(config, rpc),
      walletDocs.filter((w) => w.chain === 'sol').map((w) => w.address),
      walletDocs.filter((w) => w.chain === 'sui').map((w) => w.address),
    );

    const summary = computePnl(entries, prices);
    const held = summary.perAsset.filter((a) => a.held > 1e-9);
    const totalValueUsd = held.reduce((s, a) => s + a.marketValue, 0);

    const holdings: Holding[] = held.map((a) => ({
      asset: a.asset,
      chain: a.asset === 'SOL' ? 'sol' : 'sui',
      walletBalance: balances[a.asset],
      ledgerQty: a.held,
      avgCost: a.avgCost,
      costBasis: a.costBasis,
      currentPrice: a.currentPrice,
      valueUsd: a.marketValue,
      unrealized: a.unrealized,
      allocation: totalValueUsd > 0 ? a.marketValue / totalValueUsd : 0,
    }));

    return { holdings, totalValueUsd };
  });

  app.get(
    '/portfolio/timeseries',
    {
      schema: {
        querystring: Type.Object({ range: Type.Optional(RangeSchema) }),
        response: { 200: TimeseriesResponseSchema },
      },
    },
    async (req) => {
      const range: NavRange = req.query.range ?? '30d';
      const entries = await loadEntries(req.user.sub);
      const points = await computeNavSeries(entries, range);
      return { range, points };
    },
  );
};

export default portfolioRoutes;
