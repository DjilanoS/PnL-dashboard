import net from 'node:net';
import dns from 'node:dns/promises';
import type { Chain } from '@pnl/types';

const TIMEOUT_MS = 6000;

/**
 * Classify an IP literal (v4 or v6) as private / loopback / link-local /
 * reserved — i.e. never a valid public RPC target. Applied both to URL host
 * literals and to DNS-resolved addresses, so alternate encodings and hostnames
 * that point at internal IPs can't slip past a string check.
 */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
    if (a >= 224) return true; // multicast / reserved (224.0.0.0+)
    return false;
  }
  if (v === 6) {
    const addr = (ip.split('%')[0] ?? ip).toLowerCase(); // drop any zone id
    if (addr === '::' || addr === '::1') return true; // unspecified / loopback
    if (/^fe[89a-f]/.test(addr)) return true; // fe80::/10 link-local (+ deprecated site-local)
    if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
    if (/^ff/.test(addr)) return true; // multicast
    // IPv4-mapped / -compatible (e.g. ::ffff:127.0.0.1): re-check the embedded v4.
    const embedded = addr.split(':').pop() ?? '';
    if (embedded.includes('.') && net.isIP(embedded) === 4) return isPrivateIp(embedded);
    return false;
  }
  return true; // not a parseable IP literal → treat as unsafe
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Synchronous structural guard: http(s) only, and reject hosts that are
 * obviously internal *without* needing DNS — literal private/loopback IPs (v4
 * and v6), localhost, .local/.localhost, and packed-integer / hex IP forms
 * (e.g. http://2130706433, http://0x7f000001) that bypass dotted-IP checks.
 * This is a fast pre-filter; {@link assertPublicRpcUrl} is the authoritative
 * gate (it also resolves DNS).
 */
export function isValidRpcUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  let host = stripBrackets(u.hostname).toLowerCase();
  if (!host) return false;
  if (host.endsWith('.')) host = host.slice(0, -1); // normalize trailing dot ("localhost.")
  if (host === 'localhost' || host === '0.0.0.0') return false;
  if (host.endsWith('.local') || host.endsWith('.localhost')) return false;
  // Packed-integer / hex hosts that getaddrinfo resolves to a (usually internal)
  // address but net.isIP doesn't recognize as dotted IPv4.
  if (/^\d+$/.test(host) || /^0x[\da-f]+$/.test(host)) return false;
  if (net.isIP(host) && isPrivateIp(host)) return false;
  return true;
}

/**
 * Authoritative SSRF gate: structurally valid AND resolves only to public IPs.
 * Resolving the host catches what a string check can't — alternate IP encodings
 * (dotted-octal/hex resolve to their real address) and hostnames that point at
 * internal/metadata IPs. With `{ allowUnresolvable: true }` an NXDOMAIN host is
 * permitted — used when *storing* a URL the user may bring online later; the
 * strict default is used right before we actually connect.
 */
export async function assertPublicRpcUrl(
  raw: string,
  opts: { allowUnresolvable?: boolean } = {},
): Promise<boolean> {
  if (!isValidRpcUrl(raw)) return false;
  const host = stripBrackets(new URL(raw).hostname);
  if (net.isIP(host)) return !isPrivateIp(host); // literal IP already screened above
  let addrs: string[];
  try {
    addrs = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return opts.allowUnresolvable ?? false;
  }
  return addrs.length > 0 && addrs.every((ip) => !isPrivateIp(ip));
}

/**
 * SSRF-guarded fetch for user-supplied RPC URLs: re-validates that the host
 * resolves to a public IP immediately before connecting, and refuses to follow
 * redirects (a 3xx becomes an opaqueredirect with `res.ok === false`), so a
 * validated public host can't bounce us to an internal target.
 *
 * Residual risk: DNS rebinding between this check and undici's own connect-time
 * resolution. Fully closing it needs connection pinning (a custom dispatcher);
 * accepted here as low-value (blind) given the storage-time check above.
 */
export async function safeRpcFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!(await assertPublicRpcUrl(url))) throw new Error('blocked_rpc_url');
  return fetch(url, { ...init, redirect: 'manual' });
}

/** A lightweight, no-side-effect JSON-RPC probe per chain. */
function probeBody(chain: Chain): Record<string, unknown> {
  return chain === 'sol'
    ? { jsonrpc: '2.0', id: 1, method: 'getHealth' }
    : { jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] };
}

/** Ping an RPC URL; returns reachability + round-trip latency (null when down). */
export async function pingRpc(
  chain: Chain,
  url: string,
): Promise<{ ok: boolean; latencyMs: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await safeRpcFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(probeBody(chain)),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, latencyMs: null };
    const json = (await res.json()) as { result?: unknown; error?: unknown };
    const ok = json.error === undefined && json.result !== undefined;
    return { ok, latencyMs: ok ? Date.now() - start : null };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}
