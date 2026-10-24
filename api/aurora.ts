/**
 * Thin, allow-listed proxy to the Aurora Intents API (https://intents-api.aurora.dev).
 *
 * Why a proxy: the API key lives in a server env var (AURORA_API_KEY), we pin the
 * destination to Solana SOL / USDC, validate the Solana recipient, set a sane
 * deadline, and pass 429 Retry-After through. The browser only talks to /api/aurora.
 *
 * Endpoints used (all documented at https://docs.intents.aurora.dev):
 *   GET  /api/tokens/{apiKey}                         supported assets
 *   POST /api/quote/{apiKey}                          1Click quote (+ deposit address when dry=false)
 *   GET  /api/status/{apiKey}?depositAddress=         1Click swap status
 *   POST /api/deposit/submit/{apiKey}                 optional: tell 1Click the deposit tx hash
 *   POST /api/persistent-deposit-address/{apiKey}     Intents Deposits: persistent per-user address
 *   GET  /api/persistent-deposit-status/{apiKey}      Intents Deposits: deposits for that address
 *
 * Runs as a Vercel Node function and, in `npm run dev`, as Vite middleware (see vite.config.ts).
 */

const BASE = 'https://intents-api.aurora.dev';

/** Assets this app lets users RECEIVE (Solana mainnet, as listed by GET /api/tokens). */
export const DESTINATIONS = {
  SOL: 'nep141:sol.omft.near',
  USDC: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
} as const;
const DEST_IDS = new Set<string>(Object.values(DESTINATIONS));

const DEPOSIT_CHAINS = new Set([
  'eth', 'bera', 'base', 'gnosis', 'arb', 'bsc', 'avax', 'op', 'pol', 'monad', 'adi', 'plasma', 'scroll',
  'xlayer', 'hood', 'sui', 'aptos', 'xrp', 'btc', 'doge', 'tron', 'ton', 'near', 'sol', 'zec', 'ltc',
  'cardano', 'stellar', 'aleo', 'bch', 'dash', 'starknet', 'evm',
]);

export interface ProxyResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** True when `s` is base58 that decodes to exactly 32 bytes (a Solana public key). */
export function isSolanaAddress(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return false;
    n = n * 58n + BigInt(i);
  }
  let bytes = 0;
  while (n > 0n) { n >>= 8n; bytes++; }
  let lead = 0;
  for (const c of s) { if (c === '1') lead++; else break; }
  return bytes + lead === 32;
}

const str = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

let tokenCache: { at: number; data: unknown } | null = null;

async function call(path: string, init?: RequestInit): Promise<ProxyResult> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const text = await r.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 500) }; }
  const headers: Record<string, string> = {};
  const ra = r.headers.get('retry-after');
  if (ra) headers['Retry-After'] = ra;
  return { status: r.status, body, headers };
}

const bad = (message: string): ProxyResult => ({ status: 400, body: { message } });

export async function handleAurora(
  op: string,
  query: Record<string, string | undefined>,
  body: any,
  apiKey: string | undefined,
): Promise<ProxyResult> {
  if (!apiKey) return { status: 500, body: { message: 'Server is missing AURORA_API_KEY (see .env.example).' } };
  const k = encodeURIComponent(apiKey);

  switch (op) {
    case 'tokens': {
      if (tokenCache && Date.now() - tokenCache.at < 5 * 60_000) return { status: 200, body: tokenCache.data };
      const res = await call(`/api/tokens/${k}`);
      if (res.status === 200) {
        // Response is { tokens: [...], asset_stats: [...] }; older docs show a bare array.
        const b: any = res.body;
        const tokens = Array.isArray(b) ? b : b?.tokens ?? [];
        tokenCache = { at: Date.now(), data: { tokens } };
        return { status: 200, body: tokenCache.data };
      }
      return res;
    }

    case 'quote': {
      const b = body || {};
      if (!DEST_IDS.has(b.destinationAsset)) return bad('destinationAsset must be SOL or USDC on Solana');
      if (!isSolanaAddress(b.recipient)) return bad('recipient must be a Solana address');
      if (!str(b.originAsset)) return bad('originAsset required');
      if (!/^\d{1,40}$/.test(String(b.amount))) return bad('amount must be an integer string in the smallest unit');
      if (!str(b.refundTo, 120)) return bad('refundTo (refund address on the origin chain) required');
      const slippage = Math.min(Math.max(Number(b.slippageTolerance) || 100, 10), 500);
      const payload = {
        dry: b.dry !== false,
        swapType: 'EXACT_INPUT',
        slippageTolerance: slippage,
        originAsset: b.originAsset,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset: b.destinationAsset,
        amount: String(b.amount),
        recipient: b.recipient,
        recipientType: 'DESTINATION_CHAIN',
        refundTo: b.refundTo,
        refundType: 'ORIGIN_CHAIN',
        // Refunds begin if not completed by the deadline. 1 hour is plenty for most chains.
        deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
        quoteWaitingTimeMs: 3000,
        ...(Array.isArray(b.connectedWallets) ? { connectedWallets: b.connectedWallets.slice(0, 3) } : {}),
      };
      return call(`/api/quote/${k}`, { method: 'POST', body: JSON.stringify(payload) });
    }

    case 'status': {
      if (!str(query.depositAddress, 120)) return bad('depositAddress required');
      const qs = new URLSearchParams({ depositAddress: query.depositAddress! });
      if (str(query.depositMemo, 120)) qs.set('depositMemo', query.depositMemo!);
      return call(`/api/status/${k}?${qs}`);
    }

    case 'submit': {
      const b = body || {};
      if (!str(b.txHash, 200) || !str(b.depositAddress, 120)) return bad('txHash and depositAddress required');
      const payload: Record<string, string> = { txHash: b.txHash.trim(), depositAddress: b.depositAddress };
      if (str(b.memo, 120)) payload.memo = b.memo;
      return call(`/api/deposit/submit/${k}`, { method: 'POST', body: JSON.stringify(payload) });
    }

    case 'persistent': {
      const b = body || {};
      if (!isSolanaAddress(b.recipient)) return bad('recipient must be a Solana address');
      if (!DEST_IDS.has(b.destinationAsset)) return bad('destinationAsset must be SOL or USDC on Solana');
      if (!DEPOSIT_CHAINS.has(b.depositChain)) return bad('unsupported depositChain');
      const payload = {
        recipient: b.recipient,
        recipientType: 'DESTINATION_CHAIN',
        // `sender` is the integrator's user id; the connected wallet is the user's identity here.
        sender: b.recipient,
        depositChain: b.depositChain,
        destinationChain: 'sol',
        destinationAsset: b.destinationAsset,
      };
      return call(`/api/persistent-deposit-address/${k}`, { method: 'POST', body: JSON.stringify(payload) });
    }

    case 'pstatus': {
      if (!str(query.address, 120)) return bad('address required');
      const type = query.type;
      if (type !== 'received' && type !== 'success' && type !== 'failed') return bad('type must be received|success|failed');
      const qs = new URLSearchParams({ address: query.address!, type, limit: '20' });
      return call(`/api/persistent-deposit-status/${k}?${qs}`);
    }

    default:
      return { status: 404, body: { message: 'unknown op' } };
  }
}

/** Vercel Node function entry: /api/aurora?op=... */
export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, 'http://x');
    const query = Object.fromEntries(url.searchParams.entries());
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const out = await handleAurora(query.op || '', query, body, process.env.AURORA_API_KEY);
    for (const [h, v] of Object.entries(out.headers || {})) res.setHeader(h, v);
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  } catch (e: any) {
    res.status(502).json({ message: 'Upstream error: ' + (e?.message || 'unknown') });
  }
}
