import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { AppInstance } from '../../app';
import { isValidRpcUrl } from '../../services/rpcHealth';

let mongod: MongoMemoryServer;
let app: AppInstance;
let headers: Record<string, string>;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  const { buildApp } = await import('../../app');
  app = await buildApp();
  await app.ready();
  await app.connectDb(); // DB connects lazily on first request; force it before direct model writes
  const { User } = await import('../../models/User');
  const user = await User.create({ discordId: 'd-rpc', discordUsername: 'Rpc' });
  headers = { authorization: `Bearer ${app.jwt.sign({ sub: String(user._id) })}` };
});

after(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

test('isValidRpcUrl accepts public http(s), rejects internal / bad schemes', () => {
  assert.equal(isValidRpcUrl('https://api.mainnet-beta.solana.com'), true);
  assert.equal(isValidRpcUrl('https://fullnode.mainnet.sui.io:443'), true);
  assert.equal(isValidRpcUrl('ftp://example.com'), false);
  assert.equal(isValidRpcUrl('not a url'), false);
  assert.equal(isValidRpcUrl('http://localhost:8899'), false);
  assert.equal(isValidRpcUrl('http://127.0.0.1'), false);
  assert.equal(isValidRpcUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isValidRpcUrl('http://192.168.1.10:8899'), false);
});

test('settings require auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/settings/rpc' });
  assert.equal(res.statusCode, 401);
});

test('GET returns mainnet-beta defaults with no custom RPC', async () => {
  const res = await app.inject({ method: 'GET', url: '/settings/rpc', headers });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { sol: { url: string | null; default: string }; sui: { url: string | null } };
  assert.equal(body.sol.url, null);
  assert.equal(body.sui.url, null);
  assert.match(body.sol.default, /mainnet-beta\.solana\.com/);
});

test('POST sets a custom RPC, GET reflects it, null resets', async () => {
  let res = await app.inject({
    method: 'POST',
    url: '/settings/rpc',
    headers,
    payload: { chain: 'sol', url: 'https://my-rpc.example.com/' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal((res.json() as { sol: { url: string } }).sol.url, 'https://my-rpc.example.com/');

  res = await app.inject({ method: 'GET', url: '/settings/rpc', headers });
  assert.equal((res.json() as { sol: { url: string } }).sol.url, 'https://my-rpc.example.com/');

  res = await app.inject({ method: 'POST', url: '/settings/rpc', headers, payload: { chain: 'sol', url: null } });
  assert.equal((res.json() as { sol: { url: string | null } }).sol.url, null);
});

test('POST rejects an invalid / internal RPC URL (400)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/settings/rpc',
    headers,
    payload: { chain: 'sui', url: 'http://127.0.0.1:9000' },
  });
  assert.equal(res.statusCode, 400);
});

test('POST /rpc/health rejects an invalid URL (400)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/rpc/health',
    headers,
    payload: { chain: 'sol', url: 'http://localhost:8899' },
  });
  assert.equal(res.statusCode, 400);
});
