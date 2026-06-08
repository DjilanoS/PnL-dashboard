import type { Chain } from './order';

/** RPC endpoint config for one chain. */
export interface RpcChainSetting {
  /** The user's custom RPC URL, or null when using the default. */
  url: string | null;
  /** The built-in default (public mainnet-beta) for this chain. */
  default: string;
}

/** A user's RPC endpoint settings, per chain. */
export interface RpcSettings {
  sol: RpcChainSetting;
  sui: RpcChainSetting;
}

/** Body for POST /settings/rpc — set (or clear, with null) a chain's RPC URL. */
export interface UpdateRpcRequest {
  chain: Chain;
  /** New custom RPC URL, or null/'' to reset to the default. */
  url: string | null;
}

/** Body for POST /rpc/health — check whether an RPC URL is reachable. */
export interface RpcHealthRequest {
  chain: Chain;
  url: string;
}

export interface RpcHealthResponse {
  ok: boolean;
  /** Round-trip latency in ms when reachable, else null. */
  latencyMs: number | null;
}
