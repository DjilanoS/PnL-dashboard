import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { AppInstance } from '../../app';

let mongod: MongoMemoryServer;
let app: AppInstance;
let token: string;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  const { buildApp } = await import('../../app');
  app = await buildApp();
  await app.ready();
  const userId = new mongoose.Types.ObjectId().toString();
  token = app.jwt.sign({ sub: userId });
});

after(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

test('orders require auth, then create / list / delete', async () => {
  const headers = { authorization: `Bearer ${token}` };

  const unauth = await app.inject({ method: 'GET', url: '/orders' });
  assert.equal(unauth.statusCode, 401);

  let res = await app.inject({ method: 'GET', url: '/orders', headers });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);

  res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers,
    payload: {
      chain: 'sol',
      asset: 'SOL',
      side: 'buy',
      amount: 10,
      priceUsd: 150,
      feeUsd: 1.5,
      gasUsd: 0,
      timestamp: new Date('2026-01-01T00:00:00Z').toISOString(),
    },
  });
  assert.equal(res.statusCode, 200);
  const order = res.json() as { id: string; asset: string; amount: number; priceUsd: number; source: string };
  assert.equal(order.asset, 'SOL');
  assert.equal(order.amount, 10);
  assert.equal(order.priceUsd, 150);
  assert.equal(order.source, 'manual');

  res = await app.inject({ method: 'GET', url: '/orders', headers });
  assert.equal((res.json() as unknown[]).length, 1);

  res = await app.inject({ method: 'DELETE', url: `/orders/${order.id}`, headers });
  assert.equal(res.statusCode, 200);

  res = await app.inject({ method: 'GET', url: '/orders', headers });
  assert.equal((res.json() as unknown[]).length, 0);
});

test('PATCH /orders/:id edits an order and 404s for unknown ids', async () => {
  const headers = { authorization: `Bearer ${token}` };

  const created = await app.inject({
    method: 'POST',
    url: '/orders',
    headers,
    payload: { chain: 'sol', asset: 'JUP', side: 'buy', amount: 5, priceUsd: 0.8, feeUsd: 0, gasUsd: 0, timestamp: new Date('2026-03-01T00:00:00Z').toISOString() },
  });
  const o = created.json() as { id: string };

  const patched = await app.inject({
    method: 'PATCH',
    url: `/orders/${o.id}`,
    headers,
    payload: { chain: 'sol', asset: 'JUP', side: 'sell', amount: 7, priceUsd: 1.2, feeUsd: 0.1, gasUsd: 0, timestamp: new Date('2026-03-02T00:00:00Z').toISOString() },
  });
  assert.equal(patched.statusCode, 200);
  const u = patched.json() as { id: string; side: string; amount: number; priceUsd: number };
  assert.equal(u.id, o.id);
  assert.equal(u.side, 'sell');
  assert.equal(u.amount, 7);
  assert.equal(u.priceUsd, 1.2);

  const missing = await app.inject({
    method: 'PATCH',
    url: `/orders/${new mongoose.Types.ObjectId().toString()}`,
    headers,
    payload: { chain: 'sol', asset: 'JUP', side: 'buy', amount: 1, priceUsd: 1, feeUsd: 0, gasUsd: 0, timestamp: new Date().toISOString() },
  });
  assert.equal(missing.statusCode, 404);
});
