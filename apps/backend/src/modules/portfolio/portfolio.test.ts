import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { AppInstance } from '../../app';

let mongod: MongoMemoryServer;
let app: AppInstance;
let headers: Record<string, string>;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  process.env.CRON_SECRET = 'test-cron';
  const { buildApp } = await import('../../app');
  app = await buildApp();
  await app.ready();
  const token = app.jwt.sign({ sub: new mongoose.Types.ObjectId().toString() });
  headers = { authorization: `Bearer ${token}` };

  // Seed: buy 10 SOL @ $150, buy 100 SUI @ $1 → invested = 1500 + 100 = 1600.
  for (const payload of [
    { chain: 'sol', asset: 'SOL', side: 'buy', amount: 10, priceUsd: 150, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
    { chain: 'sui', asset: 'SUI', side: 'buy', amount: 100, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: '2026-01-01T00:00:00Z' },
  ]) {
    await app.inject({ method: 'POST', url: '/orders', headers, payload });
  }
});

after(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

test('GET /pnl/summary aggregates both assets with deterministic invested', async () => {
  const res = await app.inject({ method: 'GET', url: '/pnl/summary', headers });
  assert.equal(res.statusCode, 200);
  const s = res.json() as { perAsset: unknown[]; invested: number; realized: number; total: number };
  assert.equal(s.perAsset.length, 2);
  assert.ok(Math.abs(s.invested - 1600) < 1e-6, `invested=${s.invested}`);
  assert.equal(s.realized, 0);
  assert.ok(Number.isFinite(s.total));
});

test('GET /holdings returns both positions', async () => {
  const res = await app.inject({ method: 'GET', url: '/holdings', headers });
  assert.equal(res.statusCode, 200);
  const h = res.json() as { holdings: { asset: string; ledgerQty: number }[]; totalValueUsd: number };
  assert.equal(h.holdings.length, 2);
  const sol = h.holdings.find((x) => x.asset === 'SOL');
  assert.ok(sol && Math.abs(sol.ledgerQty - 10) < 1e-9);
  assert.ok(Number.isFinite(h.totalValueUsd));
});

test('GET /holdings keeps fully-sold positions as zero-qty rows with realized PnL', async () => {
  // Sell all 10 SOL @ $200 → realized = 10*200 - 10*150 = 500.
  await app.inject({
    method: 'POST',
    url: '/orders',
    headers,
    payload: { chain: 'sol', asset: 'SOL', side: 'sell', amount: 10, priceUsd: 200, feeUsd: 0, gasUsd: 0, timestamp: '2026-02-01T00:00:00Z' },
  });

  const res = await app.inject({ method: 'GET', url: '/holdings', headers });
  assert.equal(res.statusCode, 200);
  const h = res.json() as {
    holdings: { asset: string; ledgerQty: number; realized: number; avgCost: number }[];
  };
  // Both crypto assets remain listed (SOL closed, SUI open), plus a synthetic
  // USDC cash position from the sell proceeds → 3 rows.
  assert.equal(h.holdings.length, 3);
  const sol = h.holdings.find((x) => x.asset === 'SOL');
  assert.ok(sol, 'SOL still listed after selling all of it');
  assert.ok(Math.abs(sol!.ledgerQty) < 1e-9, `ledgerQty=${sol!.ledgerQty}`);
  assert.ok(Math.abs(sol!.realized - 500) < 1e-6, `realized=${sol!.realized}`);
  // Avg cost falls back to lifetime avg buy ($150) once the position is closed.
  assert.ok(Math.abs(sol!.avgCost - 150) < 1e-6, `avgCost=${sol!.avgCost}`);
});

test('GET /holdings synthesizes a USDC cash position from trade flows', async () => {
  // Ledger so far: bought 10 SOL @150 (1500) + 100 SUI @1 (100) = 1600 deployed,
  // then sold 10 SOL @200 (+2000). Implicit deposit floors at the 1600 peak, so
  // cash = 1600 + (2000 - 1600) = 2000.
  const res = await app.inject({ method: 'GET', url: '/holdings', headers });
  assert.equal(res.statusCode, 200);
  const h = res.json() as {
    holdings: { asset: string; valueUsd: number; ledgerQty: number; allocation: number }[];
    totalValueUsd: number;
  };
  const usdc = h.holdings.find((x) => x.asset === 'USDC');
  assert.ok(usdc, 'USDC cash position present after selling');
  assert.ok(Math.abs(usdc!.valueUsd - 2000) < 1e-6, `usdc=${usdc!.valueUsd}`);
  assert.ok(Math.abs(usdc!.ledgerQty - 2000) < 1e-6, `usdcQty=${usdc!.ledgerQty}`);
  // Allocations include USDC and sum to ~1 over the whole portfolio.
  const allocSum = h.holdings.reduce((s, x) => s + x.allocation, 0);
  assert.ok(Math.abs(allocSum - 1) < 1e-6, `allocSum=${allocSum}`);
});

test('POST /cash/adjustments shifts the USDC cash balance', async () => {
  const create = await app.inject({
    method: 'POST',
    url: '/cash/adjustments',
    headers,
    payload: { amount: -252, note: 'moved to bank' },
  });
  assert.equal(create.statusCode, 200);

  const res = await app.inject({ method: 'GET', url: '/holdings', headers });
  const h = res.json() as { holdings: { asset: string; valueUsd: number }[] };
  const usdc = h.holdings.find((x) => x.asset === 'USDC');
  assert.ok(usdc, 'USDC present');
  // 2000 trade-derived − 252 withdrawal = 1748.
  assert.ok(Math.abs(usdc!.valueUsd - 1748) < 1e-6, `usdc=${usdc!.valueUsd}`);

  // A zero amount is rejected.
  const bad = await app.inject({
    method: 'POST',
    url: '/cash/adjustments',
    headers,
    payload: { amount: 0 },
  });
  assert.equal(bad.statusCode, 400);
});

test('GET /portfolio/timeseries returns a NAV series', async () => {
  const res = await app.inject({ method: 'GET', url: '/portfolio/timeseries?range=7d', headers });
  assert.equal(res.statusCode, 200);
  const t = res.json() as { range: string; points: { date: string; totalValueUsd: number }[] };
  assert.equal(t.range, '7d');
  assert.ok(t.points.length >= 1);
  assert.ok(typeof t.points[t.points.length - 1]?.date === 'string');
});

test('GET /cron/snapshot is gated by CRON_SECRET and writes snapshots', async () => {
  const unauth = await app.inject({ method: 'GET', url: '/cron/snapshot' });
  assert.equal(unauth.statusCode, 401);

  const ok = await app.inject({
    method: 'GET',
    url: '/cron/snapshot',
    headers: { authorization: 'Bearer test-cron' },
  });
  assert.equal(ok.statusCode, 200);
  const body = ok.json() as { ok: boolean; users: number };
  assert.equal(body.ok, true);
  assert.ok(body.users >= 1);
});
