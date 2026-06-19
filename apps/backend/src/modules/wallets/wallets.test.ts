import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { AppInstance } from '../../app';
import { addWalletMessage } from '../../services/auth';

let mongod: MongoMemoryServer;
let app: AppInstance;
let userId: string;
let headers: Record<string, string>;

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = 'test-secret';
  const { buildApp } = await import('../../app');
  app = await buildApp();
  await app.ready();
  userId = new mongoose.Types.ObjectId().toString();
  headers = { authorization: `Bearer ${app.jwt.sign({ sub: userId })}` };
});

after(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
});

/** Mint a nonce and produce a valid Solana ownership signature for it. */
async function signedAdd(kp: nacl.SignKeyPair) {
  const address = bs58.encode(kp.publicKey);
  const nonceRes = await app.inject({
    method: 'POST',
    url: '/wallets/nonce',
    headers,
    payload: { chain: 'sol', address },
  });
  const { nonce } = nonceRes.json() as { nonce: string };
  const sig = nacl.sign.detached(new TextEncoder().encode(addWalletMessage(nonce)), kp.secretKey);
  return { address, nonce, signature: Buffer.from(sig).toString('base64') };
}

test('wallets require auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/wallets' });
  assert.equal(res.statusCode, 401);
});

test('rejects an unknown nonce', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/wallets',
    headers,
    payload: { chain: 'sol', address: bs58.encode(nacl.sign.keyPair().publicKey), signature: 'x', nonce: 'nope' },
  });
  assert.equal(res.statusCode, 401);
});

test('rejects a bad signature', async () => {
  const kp = nacl.sign.keyPair();
  const { address, nonce } = await signedAdd(kp);
  const res = await app.inject({
    method: 'POST',
    url: '/wallets',
    headers,
    payload: { chain: 'sol', address, signature: Buffer.from('garbage').toString('base64'), nonce },
  });
  assert.equal(res.statusCode, 401);
});

test('adds, lists, dedupes (409), and removes a wallet', async () => {
  const kp = nacl.sign.keyPair();

  // Add (valid signature).
  let add = await signedAdd(kp);
  let res = await app.inject({ method: 'POST', url: '/wallets', headers, payload: { chain: 'sol', ...add } });
  assert.equal(res.statusCode, 200);
  const created = res.json() as { id: string; chain: string; address: string };
  assert.equal(created.chain, 'sol');
  assert.equal(created.address, add.address);

  // List → one Solana wallet.
  res = await app.inject({ method: 'GET', url: '/wallets', headers });
  const list = res.json() as { sol: unknown[]; sui: unknown[] };
  assert.equal(list.sol.length, 1);
  assert.equal(list.sui.length, 0);

  // Re-add the same address (fresh nonce) → 409.
  add = await signedAdd(kp);
  res = await app.inject({ method: 'POST', url: '/wallets', headers, payload: { chain: 'sol', ...add } });
  assert.equal(res.statusCode, 409);

  // Delete → gone.
  res = await app.inject({ method: 'DELETE', url: `/wallets/${created.id}`, headers });
  assert.equal(res.statusCode, 200);
  res = await app.inject({ method: 'GET', url: '/wallets', headers });
  assert.equal((res.json() as { sol: unknown[] }).sol.length, 0);
});

test('GET /auth/me returns identity + grouped wallets', async () => {
  const { User } = await import('../../models/User');
  await User.create({ _id: new mongoose.Types.ObjectId(userId), discordId: 'd1', discordUsername: 'Tester' });

  const res = await app.inject({ method: 'GET', url: '/auth/me', headers });
  assert.equal(res.statusCode, 200);
  const me = res.json() as { user: { discordId: string }; wallets: { sol: unknown[]; sui: unknown[] } };
  assert.equal(me.user.discordId, 'd1');
  assert.ok(Array.isArray(me.wallets.sol) && Array.isArray(me.wallets.sui));

  // Sliding session: /auth/me mints a fresh JWT (same subject) so an actively-used
  // app never hits the 7-day expiry.
  const refreshed = res.headers['x-refreshed-token'];
  assert.equal(typeof refreshed, 'string');
  assert.equal((app.jwt.verify(refreshed as string) as { sub: string }).sub, userId);
});
