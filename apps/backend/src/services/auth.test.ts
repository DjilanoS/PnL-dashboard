import { test } from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { addWalletMessage, verifySolanaSignature, verifySuiSignature } from './auth';

test('solana signature verifies and rejects tampering', () => {
  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const msg = addWalletMessage('abc123');
  const sig = nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey);
  const sigB64 = Buffer.from(sig).toString('base64');

  assert.equal(verifySolanaSignature(address, sigB64, msg), true);
  assert.equal(verifySolanaSignature(address, sigB64, addWalletMessage('different')), false);
  assert.equal(verifySolanaSignature(bs58.encode(nacl.sign.keyPair().publicKey), sigB64, msg), false);
});

test('sui signature verifies and rejects tampering', async () => {
  const kp = new Ed25519Keypair();
  const address = kp.toSuiAddress();
  const msg = addWalletMessage('xyz789');
  const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(msg));

  assert.equal(await verifySuiSignature(address, signature, msg), true);
  assert.equal(await verifySuiSignature(address, signature, addWalletMessage('tampered')), false);
});
