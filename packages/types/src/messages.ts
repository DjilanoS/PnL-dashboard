/**
 * The exact string a wallet signs to prove ownership when adding it to "your
 * wallets". Shared by the backend (signature verification) and the frontend
 * (signing) so the two can never drift — they MUST match byte-for-byte, or
 * every add-wallet signature fails verification.
 */
export function addWalletMessage(nonce: string): string {
  return `Add wallet to PnL Dashboard\nnonce: ${nonce}`;
}
