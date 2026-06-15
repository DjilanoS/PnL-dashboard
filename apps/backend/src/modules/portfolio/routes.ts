import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import { tokenKey, type Holding, type NavRange, type TokenRef } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { Wallet } from '../../models/Wallet';
import { getUserRpc } from '../../models/User';
import { computePnl, type LedgerEntry } from '../../services/pnlEngine';
import { computeNavSeries } from '../../services/nav';
import {
  adjustmentsSumAt,
  buildCashTimeline,
  usdcBalanceAt,
  USDC_SOL_MINT,
  USDC_LOGO,
  type CashAdjustmentLite,
} from '../../services/cash';
import { getCurrentPricesCached } from '../../services/prices';
import { CashAdjustment } from '../../models/CashAdjustment';
import { getAllWalletTokenBalances } from '../../services/balances';
import { HoldingsResponseSchema, PnlSummarySchema, TimeseriesResponseSchema } from '../../schemas';
import { configWithUserRpc, type AppConfig } from '../../config/env';

/** Distinct tokens referenced by a set of ledger entries. */
function tokensOf(entries: LedgerEntry[]): TokenRef[] {
  const seen = new Map<string, TokenRef>();
  for (const e of entries) {
    const key = tokenKey(e.chain, e.address);
    if (!seen.has(key)) seen.set(key, { chain: e.chain, address: e.address });
  }
  return [...seen.values()];
}

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
  }

  async function loadAdjustments(userId: string): Promise<CashAdjustmentLite[]> {
    const docs = await CashAdjustment.find({ userId: new mongoose.Types.ObjectId(userId) });
    return docs.map((d) => ({ ms: d.timestamp.getTime(), amount: Number.parseFloat(String(d.amount)) }));
  }

  app.get('/pnl/summary', { schema: { response: { 200: PnlSummarySchema } } }, async (req) => {
    const entries = await loadEntries(req.user.sub);
    const prices = await getCurrentPricesCached(tokensOf(entries));
    return computePnl(entries, prices);
  });

  app.get('/holdings', { schema: { response: { 200: HoldingsResponseSchema } } }, async (req) => {
    const userId = new mongoose.Types.ObjectId(req.user.sub);
    const [entries, walletDocs, rpc] = await Promise.all([
      loadEntries(req.user.sub),
      Wallet.find({ userId }),
      getUserRpc(req.user.sub),
    ]);
    const prices = await getCurrentPricesCached(tokensOf(entries));
    // Live balances per token, summed across all tracked wallets, using the
    // user's own RPC endpoint (or the mainnet-beta default).
    const balances = await getAllWalletTokenBalances(
      configWithUserRpc(config, rpc),
      walletDocs.filter((w) => w.chain === 'sol').map((w) => w.address),
      walletDocs.filter((w) => w.chain === 'sui').map((w) => w.address),
    );

    const summary = computePnl(entries, prices);
    // USDC cash: trade-derived balance (sells refill, buys spend) + manual
    // deposit/withdrawal adjustments. Part of portfolio value, but no PnL.
    const usdc =
      usdcBalanceAt(buildCashTimeline(entries)) + adjustmentsSumAt(await loadAdjustments(req.user.sub));
    // Keep every traded asset as a row — fully-sold positions stay visible with
    // quantity 0 so their realized PnL, avg buy and avg sell remain on the
    // dashboard. Held crypto value + USDC cash make up the portfolio total.
    const totalValueUsd = summary.perAsset.reduce((s, a) => s + a.marketValue, 0) + usdc;

    const holdings: Holding[] = summary.perAsset.map((a) => {
      const closed = a.held <= 1e-9;
      return {
        chain: a.chain,
        address: a.address,
        asset: a.asset,
        name: a.name,
        image: a.image,
        decimals: a.decimals,
        walletBalance: balances.get(tokenKey(a.chain, a.address)) ?? null,
        ledgerQty: a.held,
        // avgCost collapses to 0 once a position is fully closed; fall back to
        // the lifetime average buy so the cost stays visible on zero-qty rows.
        avgCost: closed ? a.avgBuy : a.avgCost,
        costBasis: a.costBasis,
        currentPrice: a.currentPrice,
        valueUsd: a.marketValue,
        realized: a.realized,
        unrealized: a.unrealized,
        allocation: totalValueUsd > 0 ? a.marketValue / totalValueUsd : 0,
      };
    });

    // Synthetic USDC cash position (price $1, no PnL) so sold value isn't lost.
    if (usdc > 0.01) {
      holdings.push({
        chain: 'sol',
        address: USDC_SOL_MINT,
        asset: 'USDC',
        name: 'USD Coin',
        image: USDC_LOGO,
        decimals: 6,
        walletBalance: null,
        ledgerQty: usdc,
        avgCost: 1,
        costBasis: usdc,
        currentPrice: 1,
        valueUsd: usdc,
        realized: 0,
        unrealized: 0,
        allocation: totalValueUsd > 0 ? usdc / totalValueUsd : 0,
      });
    }

    // Open positions first (by value), then closed ones (by realized PnL).
    holdings.sort((x, y) => y.valueUsd - x.valueUsd || y.realized - x.realized);

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
      const [entries, adjustments] = await Promise.all([
        loadEntries(req.user.sub),
        loadAdjustments(req.user.sub),
      ]);
      const points = await computeNavSeries(entries, range, adjustments);
      return { range, points };
    },
  );
};

export default portfolioRoutes;
