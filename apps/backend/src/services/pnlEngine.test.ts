import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAssetPnl, computePnl, type LedgerEntry } from './pnlEngine';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test('weighted-average cost: buys, partial sell, unrealized', () => {
  const entries: LedgerEntry[] = [
    { asset: 'SOL', side: 'buy', amount: 10, priceUsd: 100, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
    { asset: 'SOL', side: 'buy', amount: 10, priceUsd: 200, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-02T00:00:00Z' },
    { asset: 'SOL', side: 'sell', amount: 10, priceUsd: 300, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-03T00:00:00Z' },
  ];
  const r = computeAssetPnl('SOL', entries, 250);

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
    { asset: 'SUI', side: 'buy', amount: 100, priceUsd: 1, feeUsd: 10, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
    { asset: 'SUI', side: 'sell', amount: 100, priceUsd: 2, feeUsd: 10, gasUsd: 0, timestamp: '2026-01-02T00:00:00Z' },
  ];
  const r = computeAssetPnl('SUI', entries, 2);
  // cost basis = 100 + 10 = 110; proceeds = 200 - 10 = 190; realized = 190 - 110 = 80
  assert.ok(close(r.realized, 80), `realized=${r.realized}`);
  assert.ok(close(r.held, 0), `held=${r.held}`);
  assert.ok(close(r.unrealized, 0), `unrealized=${r.unrealized}`);
});

test('computePnl aggregates both assets and ROI', () => {
  const entries: LedgerEntry[] = [
    { asset: 'SOL', side: 'buy', amount: 10, priceUsd: 100, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
    { asset: 'SUI', side: 'buy', amount: 100, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
  ];
  const summary = computePnl(entries, { SOL: 150, SUI: 2 });
  // SOL unrealized (150-100)*10=500; SUI (2-1)*100=100; total 600; invested 1100
  assert.equal(summary.perAsset.length, 2);
  assert.ok(close(summary.unrealized, 600), `unrealized=${summary.unrealized}`);
  assert.ok(close(summary.realized, 0));
  assert.ok(close(summary.total, 600));
  assert.ok(close(summary.invested, 1100));
  assert.ok(close(summary.roi, 600 / 1100), `roi=${summary.roi}`);
});
