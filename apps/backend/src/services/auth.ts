import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { Chain } from '@pnl/types';

/** Random single-use challenge. */
export function generateNonce(): string {
  return randomBytes(24).toString('hex');
}

// The signed add-wallet message lives in @pnl/types so the backend (verify) and
// frontend (sign) share one definition and can't drift. Re-exported here so
// existing importers (`services/auth`) keep working.
export { addWalletMessage } from '@pnl/types';

/** Verify an Ed25519 signature from a Solana wallet (signature = base64 of 64 raw bytes). */
export function verifySolanaSignature(address: string, signatureB64: string, message: string): boolean {
  try {
    const sig = new Uint8Array(Buffer.from(signatureB64, 'base64'));
    const pub = bs58.decode(address);
    const msg = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

/** Verify a Sui personal-message signature (signature = wallet's base64 string). */
export async function verifySuiSignature(
  address: string,
  signatureB64: string,
  message: string,
): Promise<boolean> {
  try {
    const msg = new TextEncoder().encode(message);
    // Throws if the signature is invalid or doesn't match the address.
    await verifyPersonalMessageSignature(msg, signatureB64, { address: normalizeSuiAddress(address) });
    return true;
  } catch {
    return false;
  }
}

export async function verifyWalletSignature(
  chain: Chain,
  address: string,
  signatureB64: string,
  message: string,
): Promise<boolean> {
  return chain === 'sol'
    ? verifySolanaSignature(address, signatureB64, message)
    : verifySuiSignature(address, signatureB64, message);
}
