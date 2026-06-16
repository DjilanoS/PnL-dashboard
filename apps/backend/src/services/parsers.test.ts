import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SuiTransactionBlockResponse } from '@mysten/sui/jsonRpc';
import {
  extractSolanaSignature,
  solDeltaForUser,
  userSwappedToken,
  type HeliusTx,
} from './solanaParser';
import { extractSuiDigest, suiDeltaForUser } from './suiParser';

const SOL_SIG =
  '5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7';
// Sui digests are base58 (~44 chars). Reuse a valid base58 slice.
const SUI_DIGEST = SOL_SIG.slice(0, 44);

test('extractSolanaSignature handles urls and raw sigs', () => {
  assert.equal(extractSolanaSignature(`https://solscan.io/tx/${SOL_SIG}`), SOL_SIG);
  assert.equal(extractSolanaSignature(`https://explorer.solana.com/tx/${SOL_SIG}?cluster=mainnet`), SOL_SIG);
  assert.equal(extractSolanaSignature(SOL_SIG), SOL_SIG);
  assert.equal(extractSolanaSignature('not a signature'), null);
});

test('extractSuiDigest handles urls and raw digests', () => {
  assert.equal(extractSuiDigest(`https://suivision.xyz/txblock/${SUI_DIGEST}`), SUI_DIGEST);
  assert.equal(extractSuiDigest(`https://suiscan.xyz/mainnet/tx/${SUI_DIGEST}`), SUI_DIGEST);
  assert.equal(extractSuiDigest(SUI_DIGEST), SUI_DIGEST);
  assert.equal(extractSuiDigest('nope'), null);
});

test('solDeltaForUser: buy = positive SOL (fee added back)', () => {
  const user = 'USERwallet1111111111111111111111111111111111';
  // Bought 5 SOL paying USDC; balance change = +5 SOL - 5000 lamports fee.
  const tx: HeliusTx = {
    signature: SOL_SIG,
    timestamp: 1_700_000_000,
    type: 'SWAP',
    fee: 5000,
    feePayer: user,
    accountData: [{ account: user, nativeBalanceChange: 5 * 1e9 - 5000, tokenBalanceChanges: [] }],
  };
  assert.ok(Math.abs(solDeltaForUser(tx, user) - 5) < 1e-9);
});

test('solDeltaForUser: sell = negative SOL', () => {
  const user = 'USERwallet1111111111111111111111111111111111';
  const tx: HeliusTx = {
    signature: SOL_SIG,
    timestamp: 1_700_000_000,
    type: 'SWAP',
    fee: 5000,
    feePayer: user,
    accountData: [{ account: user, nativeBalanceChange: -3 * 1e9 - 5000, tokenBalanceChanges: [] }],
  };
  assert.ok(Math.abs(solDeltaForUser(tx, user) + 3) < 1e-9);
});

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

test('userSwappedToken: true when a non-wSOL token leg moves for the user', () => {
  const user = 'USERwallet1111111111111111111111111111111111';
  // SOL -> USDC swap: the user receives USDC (the counter-asset leg).
  const tx: HeliusTx = {
    signature: SOL_SIG,
    timestamp: 1_700_000_000,
    type: 'UNKNOWN', // Helius often mislabels real swaps as UNKNOWN
    fee: 5000,
    feePayer: user,
    accountData: [
      { account: user, nativeBalanceChange: -3 * 1e9, tokenBalanceChanges: [] },
      {
        account: 'usdcAta',
        nativeBalanceChange: 0,
        tokenBalanceChanges: [
          { userAccount: user, mint: USDC_MINT, rawTokenAmount: { tokenAmount: '420000000', decimals: 6 } },
        ],
      },
    ],
  };
  assert.equal(userSwappedToken(tx, user), true);
});

test('userSwappedToken: false for a plain SOL transfer (no token leg)', () => {
  const user = 'USERwallet1111111111111111111111111111111111';
  const tx: HeliusTx = {
    signature: SOL_SIG,
    timestamp: 1_700_000_000,
    type: 'TRANSFER',
    fee: 5000,
    feePayer: user,
    accountData: [{ account: user, nativeBalanceChange: -2 * 1e9, tokenBalanceChanges: [] }],
  };
  assert.equal(userSwappedToken(tx, user), false);
});

test('userSwappedToken: false when only wSOL moves (wSOL is just SOL)', () => {
  const user = 'USERwallet1111111111111111111111111111111111';
  const tx: HeliusTx = {
    signature: SOL_SIG,
    timestamp: 1_700_000_000,
    type: 'UNKNOWN',
    fee: 5000,
    feePayer: user,
    accountData: [
      {
        account: 'wsolAta',
        nativeBalanceChange: 0,
        tokenBalanceChanges: [
          { userAccount: user, mint: WSOL_MINT, rawTokenAmount: { tokenAmount: '1000000000', decimals: 9 } },
        ],
      },
    ],
  };
  assert.equal(userSwappedToken(tx, user), false);
});

test('suiDeltaForUser: sell adds gas back, negative SUI', () => {
  const user = '0x0000000000000000000000000000000000000000000000000000000000000abc';
  // Sold 10 SUI; balance change includes gas. gas = 1e6+2e6-5e5 = 2.5e6 MIST.
  const tx = {
    digest: SUI_DIGEST,
    timestampMs: '1700000000000',
    balanceChanges: [
      {
        owner: { AddressOwner: user },
        coinType: '0x2::sui::SUI',
        amount: String(-10 * 1e9 - 2_500_000),
      },
    ],
    effects: {
      status: { status: 'success' },
      gasUsed: {
        computationCost: '1000000',
        storageCost: '2000000',
        storageRebate: '500000',
        nonRefundableStorageFee: '0',
      },
    },
  } as unknown as SuiTransactionBlockResponse;

  const { sui, gas } = suiDeltaForUser(tx, user);
  assert.ok(Math.abs(sui + 10) < 1e-6, `expected ~-10, got ${sui}`);
  assert.ok(Math.abs(gas - 0.0025) < 1e-9, `expected gas 0.0025, got ${gas}`);
});
