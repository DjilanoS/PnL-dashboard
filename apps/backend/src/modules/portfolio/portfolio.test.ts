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
