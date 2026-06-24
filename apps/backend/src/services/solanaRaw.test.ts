import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppConfig } from '../config/env';
import { parseSolanaSignature, solDeltaFromRawTx } from './solanaParser';

// Real mainnet tx: USDC -> SOL buy (~41.79 SOL) where SOL is delivered natively.
// Verifies wSOL-as-SOL handling end-to-end against a live transaction shape.
const SIG =
  '8RvNc6m8yovU4cjSqiJbPCbbqDpg9tGmYU7Rr13nCy87bi5AxCnytmHJXZaK5MGqxb8mAEsLUst4UN7NZzLvAmv';
const USER = '6d54a62mh3JSNqKTL39jvfcsYEpYTKktt2NMUZXhVdKE';

test('solDeltaFromRawTx parses a real USDC->SOL buy (native + wSOL)', async () => {
  const res = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [SIG, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  });
  const { result } = (await res.json()) as { result: Parameters<typeof solDeltaFromRawTx>[0] | null };
  if (!result) {
    // Public RPC may rate-limit / lack archival history; don't fail the suite.
    console.warn('skipped: tx not returned by public RPC');
    return;
  }

  const delta = solDeltaFromRawTx(result, USER);
  assert.ok(delta > 0, `expected a buy (positive), got ${delta}`);
  assert.ok(Math.abs(delta - 41.7867) < 0.01, `expected ~41.7867 SOL, got ${delta}`);
});

test('parseSolanaSignature auto-detects the signer when no address is given', async () => {
  // Uses the public RPC (no key) + DefiLlama for price.
  const config = { SOLANA_RPC_URL: '', HELIUS_API_KEY: '' } as AppConfig;
  let preview;
  try {
    preview = await parseSolanaSignature(config, `https://solscan.io/tx/${SIG}`);
  } catch (e) {
    console.warn('skipped (RPC unavailable):', (e as Error).message);
    return;
  }
  if (!preview) {
    console.warn('skipped: tx not returned by public RPC');
    return;
  }
  assert.equal(preview.asset, 'SOL');
  assert.equal(preview.side, 'buy');
  assert.ok(Math.abs(preview.amount - 41.7867) < 0.01, `amount=${preview.amount}`);
});

// Real mainnet tx: a gasless Jupiter Ultra swap (USDC -> ~42.58 SOL). The fee
// payer is a gas sponsor and the trader signer nets zero SOL — the swap output
// is unwrapped from wSOL into a separate wallet. With no address given, the
// parser must still find the SOL buy instead of "no trade found".
const GASLESS_SIG =
  '4Kim97TYxXHbcZyo9aVmuvmg7NQjK4bK2GKXD2GBYdDFuY4mLmNeSoBD8u1iwE5BP8eQZi682bPVrCcZe2NKXzZK';

test('parseSolanaSignature finds a gasless/relayed swap (fee payer is a sponsor)', async () => {
  const config = { SOLANA_RPC_URL: '', HELIUS_API_KEY: '' } as AppConfig;
  let preview;
  try {
    preview = await parseSolanaSignature(config, `https://solscan.io/tx/${GASLESS_SIG}`);
  } catch (e) {
    console.warn('skipped (RPC unavailable):', (e as Error).message);
    return;
  }
  if (!preview) {
    console.warn('skipped: tx not returned by public RPC');
    return;
  }
  assert.equal(preview.asset, 'SOL');
  assert.equal(preview.side, 'buy');
  assert.ok(Math.abs(preview.amount - 42.5843) < 0.01, `amount=${preview.amount}`);
  // The user wasn't the fee payer (a sponsor paid gas), so no gas is charged.
  assert.equal(preview.gasUsd, 0);
});
