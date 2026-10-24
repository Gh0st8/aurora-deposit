// Browser client for our /api/aurora proxy. Types mirror the Aurora Intents API responses we use.

export const DEST = {
  SOL: { id: 'nep141:sol.omft.near', symbol: 'SOL', decimals: 9, mint: null as string | null },
  USDC: {
    id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    symbol: 'USDC',
    decimals: 6,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
} as const;
export type DestKey = keyof typeof DEST;

export interface Token {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  contractAddress?: string | null;
}

export interface Quote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut: string;
  timeEstimate?: number;
  deadline?: string;
  timeWhenInactive?: string;
  refundFee?: string;
  withdrawFee?: string;
}
export interface QuoteResponse {
  quote: Quote;
  quoteRequest: Record<string, unknown>;
  signature?: string;
  timestamp?: string;
  correlationId?: string;
}

export type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'INCOMPLETE_DEPOSIT'
  | 'REFUNDED'
  | 'FAILED';

export type TxRef = string | { hash: string; explorerUrl?: string };
export interface StatusResponse {
  status: SwapStatus;
  updatedAt?: string;
  swapDetails?: {
    amountInFormatted?: string | null;
    amountOutFormatted?: string | null;
    depositedAmountFormatted?: string | null;
    refundedAmountFormatted?: string | null;
    refundReason?: string | null;
    originChainTxHashes?: TxRef[];
    destinationChainTxHashes?: TxRef[];
    nearTxHashes?: TxRef[];
  };
}

export interface PersistentDeposit {
  tx_hash: string;
  fromChain?: string | null;
  destinationChain?: string | null;
  asset_id: string | null;
  decimals: number | null;
  amount: string;
  from?: string;
  created_at: string;
  deposit_address: string;
  recipient: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) {
    super(message);
  }
}

async function req<T>(op: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const qs = new URLSearchParams({ op, ...(opts.query || {}) });
  const r = await fetch(`/api/aurora?${qs}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const ra = Number(r.headers.get('Retry-After')) || undefined;
    const msg = (data && (data.message || data.error)) || `Request failed (${r.status})`;
    throw new ApiError(Array.isArray(msg) ? msg.join(', ') : String(msg), r.status, ra);
  }
  return data as T;
}

export const aurora = {
  tokens: () => req<{ tokens: Token[] }>('tokens').then((d) => d.tokens),
  quote: (body: {
    dry: boolean;
    originAsset: string;
    destinationAsset: string;
    amount: string;
    recipient: string;
    refundTo: string;
    slippageTolerance?: number;
  }) => req<QuoteResponse>('quote', { body }),
  status: (depositAddress: string, depositMemo?: string) =>
    req<StatusResponse>('status', { query: { depositAddress, ...(depositMemo ? { depositMemo } : {}) } }),
  submit: (txHash: string, depositAddress: string, memo?: string) =>
    req<unknown>('submit', { body: { txHash, depositAddress, memo } }),
  persistent: (recipient: string, depositChain: string, destinationAsset: string) =>
    req<{ depositAddress: string; alreadyExists: boolean; memo?: string }>('persistent', {
      body: { recipient, depositChain, destinationAsset },
    }),
  pstatus: (address: string, type: 'received' | 'success' | 'failed') =>
    req<{ deposits: PersistentDeposit[] }>('pstatus', { query: { address, type } }),
};

/** Human amount -> smallest-unit integer string, without floating point. */
export function toUnits(human: string, decimals: number): string | null {
  const s = human.trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  if (f.length > decimals) return null;
  const units = BigInt((w || '0') + f.padEnd(decimals, '0'));
  return units > 0n ? units.toString() : null;
}

export function fromUnits(units: string, decimals: number | null): string {
  if (decimals == null) return units;
  const n = BigInt(units);
  const d = 10n ** BigInt(decimals);
  const frac = (n % d).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (n / d).toString() + (frac ? '.' + frac.slice(0, 6) : '');
}

export function txHash(t: TxRef): string {
  return typeof t === 'string' ? t : t.hash;
}
export function solscanTx(hash: string) {
  return `https://solscan.io/tx/${hash}`;
}
export function solscanAccount(addr: string) {
  return `https://solscan.io/account/${addr}`;
}

/** Chains a user can send from. `evm` returns one address valid on every supported EVM chain. */
export const SOURCE_CHAINS: { id: string; label: string; hint?: string }[] = [
  { id: 'evm', label: 'Ethereum & EVM', hint: 'Ethereum, Base, Arbitrum, BNB, Polygon, Optimism, Avalanche… one address' },
  { id: 'btc', label: 'Bitcoin' },
  { id: 'tron', label: 'Tron' },
  { id: 'ton', label: 'TON' },
  { id: 'near', label: 'NEAR' },
  { id: 'sui', label: 'Sui' },
  { id: 'xrp', label: 'XRP' },
  { id: 'doge', label: 'Dogecoin' },
  { id: 'zec', label: 'Zcash' },
  { id: 'ltc', label: 'Litecoin' },
  { id: 'aptos', label: 'Aptos' },
  { id: 'cardano', label: 'Cardano' },
  { id: 'sol', label: 'Solana', hint: 'Any SPL token from another wallet or exchange' },
];

export const CHAIN_NAMES: Record<string, string> = {
  eth: 'Ethereum', base: 'Base', arb: 'Arbitrum', bsc: 'BNB Chain', pol: 'Polygon', op: 'Optimism',
  avax: 'Avalanche', gnosis: 'Gnosis', bera: 'Berachain', btc: 'Bitcoin', tron: 'Tron', ton: 'TON',
  near: 'NEAR', sui: 'Sui', xrp: 'XRP', doge: 'Dogecoin', zec: 'Zcash', ltc: 'Litecoin', aptos: 'Aptos',
  cardano: 'Cardano', sol: 'Solana', stellar: 'Stellar', starknet: 'Starknet', monad: 'Monad',
  scroll: 'Scroll', bch: 'Bitcoin Cash', dash: 'Dash', aleo: 'Aleo', xlayer: 'X Layer', plasma: 'Plasma',
  adi: 'ADI', hood: 'Robinhood Chain', abs: 'Abstract', fogo: 'Fogo', hypercore: 'Hypercore',
  movement: 'Movement', qtc: 'QTC',
};
export const chainName = (c?: string | null) => (c ? CHAIN_NAMES[c] || c.toUpperCase() : '');
