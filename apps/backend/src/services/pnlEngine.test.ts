import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_SOL_MINT, NATIVE_SUI_TYPE, tokenKey } from '@pnl/types';
import { computePnl, computeTokenPnl, type LedgerEntry, type TokenMetaLite } from './pnlEngine';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const SOL: TokenMetaLite = { chain: 'sol', address: NATIVE_SOL_MINT, asset: 'SOL', decimals: 9 };
const SUI: TokenMetaLite = { chain: 'sui', address: NATIVE_SUI_TYPE, asset: 'SUI', decimals: 9 };

type Leg = Pick<LedgerEntry, 'side' | 'amount' | 'priceUsd' | 'feeUsd' | 'gasUsd' | 'timestamp'>;
const entry = (token: TokenMetaLite, leg: Leg): LedgerEntry => ({ ...token, ...leg });

test('weighted-average cost: buys, partial sell, unrealized', () => {
  const entries: LedgerEntry[] = [
    entry(SOL, { side: 'buy', amount: 10, priceUsd: 100, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' }),
    entry(SOL, { side: 'buy', amount: 10, priceUsd: 200, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-02T00:00:00Z' }),
    entry(SOL, { side: 'sell', amount: 10, priceUsd: 300, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-03T00:00:00Z' }),
  ];
  const r = computeTokenPnl(SOL, entries, 250);

  assert.ok(close(r.held, 10), `held=${r.held}`);
  assert.ok(close(r.avgCost, 150), `avgCost=${r.avgCost}`);
  assert.ok(close(r.costBasis, 1500), `costBasis=${r.costBasis}`);
  assert.ok(close(r.realized, 1500), `realized=${r.realized}`); // (300-150)*10
  assert.ok(close(r.unrealized, 1000), `unrealized=${r.unrealized}`); // (250-150)*10
  assert.ok(close(r.marketValue, 2500), `mv=${r.marketValue}`);
  assert.ok(close(r.invested, 3000), `invested=${r.invested}`);
  assert.ok(close(r.avgBuy, 150), `avgBuy=${r.avgBuy}`);
  assert.ok(close(r.avgSell, 300), `avgSell=${r.avgSell}`);
});

test('fees fold into cost basis (buy) and reduce proceeds (sell)', () => {
  const entries: LedgerEntry[] = [
    entry(SUI, { side: 'buy', amount: 100, priceUsd: 1, feeUsd: 10, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' }),
    entry(SUI, { side: 'sell', amount: 100, priceUsd: 2, feeUsd: 10, gasUsd: 0, timestamp: '2026-01-02T00:00:00Z' }),
  ];
  const r = computeTokenPnl(SUI, entries, 2);
  // cost basis = 100 + 10 = 110; proceeds = 200 - 10 = 190; realized = 190 - 110 = 80
  assert.ok(close(r.realized, 80), `realized=${r.realized}`);
  assert.ok(close(r.held, 0), `held=${r.held}`);
  assert.ok(close(r.unrealized, 0), `unrealized=${r.unrealized}`);
});

test('computePnl aggregates tokens across chains and ROI', () => {
  const entries: LedgerEntry[] = [
    entry(SOL, { side: 'buy', amount: 10, priceUsd: 100, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' }),
    entry(SUI, { side: 'buy', amount: 100, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' }),
  ];
  const summary = computePnl(entries, {
    [tokenKey('sol', NATIVE_SOL_MINT)]: 150,
    [tokenKey('sui', NATIVE_SUI_TYPE)]: 2,
  });
  // SOL unrealized (150-100)*10=500; SUI (2-1)*100=100; total 600; invested 1100
  assert.equal(summary.perAsset.length, 2);
  assert.ok(close(summary.unrealized, 600), `unrealized=${summary.unrealized}`);
  assert.ok(close(summary.realized, 0));
  assert.ok(close(summary.total, 600));
  assert.ok(close(summary.invested, 1100));
  assert.ok(close(summary.roi, 600 / 1100), `roi=${summary.roi}`);
});

test('same symbol on different chains stays separate', () => {
  const usdcSol: TokenMetaLite = { chain: 'sol', address: 'EPjFWdd5...USDC', asset: 'USDC', decimals: 6 };
  const usdcSui: TokenMetaLite = { chain: 'sui', address: '0x5d4b...::coin::COIN', asset: 'USDC', decimals: 6 };
  const entries: LedgerEntry[] = [
    entry(usdcSol, { side: 'buy', amount: 100, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' }),
    entry(usdcSui, { side: 'buy', amount: 50, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-02T00:00:00Z' }),
  ];
  const summary = computePnl(entries, {
    [tokenKey('sol', usdcSol.address)]: 1,
    [tokenKey('sui', usdcSui.address)]: 1,
  });
  assert.equal(summary.perAsset.length, 2); // not merged by symbol
});
