import { useEffect, useMemo, useState } from 'react';
import {
  aurora, chainName, DEST, DestKey, QuoteResponse, solscanTx, StatusResponse, Token, toUnits, txHash,
} from '../lib/aurora';
import { Copy, QR, short, usePoll } from './ui';

const STEPS = ['PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS'] as const;
const STEP_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Waiting for deposit',
  KNOWN_DEPOSIT_TX: 'Deposit seen',
  PROCESSING: 'Swapping & bridging',
  SUCCESS: 'Delivered on Solana',
  INCOMPLETE_DEPOSIT: 'Deposit below quoted amount',
  REFUNDED: 'Refunded to your refund address',
  FAILED: 'Failed',
};
const TERMINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);

interface Active { res: QuoteResponse; originSymbol: string; originChain: string }

/**
 * 1Click Swap via Aurora Intents: quote -> unique deposit address -> live status, with refunds.
 */
export function QuoteFlow({ recipient, dest, onArrived }: { recipient: string; dest: DestKey; onArrived: () => void }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [chain, setChain] = useState('base');
  const [assetId, setAssetId] = useState('');
  const [amount, setAmount] = useState('');
  const [refundTo, setRefundTo] = useState('');
  const [preview, setPreview] = useState<QuoteResponse | null>(null);
  const [active, setActive] = useState<Active | null>(() => {
    const s = localStorage.getItem('ad:active');
    return s ? JSON.parse(s) : null;
  });
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [submitted, setSubmitted] = useState('');

  useEffect(() => {
    aurora.tokens().then(setTokens).catch((e) => setError('Could not load supported tokens: ' + e.message));
  }, []);

  const chains = useMemo(() => {
    const set = new Set(tokens.map((t) => t.blockchain));
    return [...set].sort((a, b) => chainName(a).localeCompare(chainName(b)));
  }, [tokens]);
  const chainTokens = useMemo(
    () => tokens.filter((t) => t.blockchain === chain && t.assetId !== DEST[dest].id).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokens, chain, dest],
  );
  const token = chainTokens.find((t) => t.assetId === assetId) || chainTokens.find((t) => !t.contractAddress) || chainTokens[0];

  useEffect(() => { if (token && token.assetId !== assetId) setAssetId(token.assetId); }, [token, assetId]);
  useEffect(() => { setPreview(null); }, [chain, assetId, amount, refundTo, dest, recipient]);
  useEffect(() => { if (chain === 'sol' && !refundTo) setRefundTo(recipient); }, [chain, recipient, refundTo]);

  const units = token ? toUnits(amount, token.decimals) : null;
  const usd = token?.price && Number(amount) ? Number(amount) * token.price : null;
  const ready = !!token && !!units && refundTo.trim().length > 0;

  async function getQuote(dry: boolean) {
    if (!token || !units) return;
    setBusy(dry ? 'quote' : 'lock');
    setError('');
    try {
      const res = await aurora.quote({
        dry, originAsset: token.assetId, destinationAsset: DEST[dest].id, amount: units, recipient, refundTo: refundTo.trim(),
      });
      if (dry) setPreview(res);
      else {
        const a: Active = { res, originSymbol: token.symbol, originChain: token.blockchain };
        localStorage.setItem('ad:active', JSON.stringify(a));
        setActive(a);
        setStatus(null);
        setPreview(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  const depAddr = active?.res.quote.depositAddress;
  usePoll(async () => {
    if (!depAddr) return;
    const s = await aurora.status(depAddr, active?.res.quote.depositMemo);
    setStatus((prev) => {
      if (s.status === 'SUCCESS' && prev?.status !== 'SUCCESS') onArrived();
      return s;
    });
  }, 6_000, !!depAddr && !TERMINAL.has(status?.status || ''), [depAddr]);

  function reset() {
    localStorage.removeItem('ad:active');
    setActive(null);
    setStatus(null);
    setSubmitted('');
    setHash('');
  }

  if (active && depAddr) {
    const q = active.res.quote;
    const st = status?.status || 'PENDING_DEPOSIT';
    const idx = STEPS.indexOf(st as (typeof STEPS)[number]);
    const d = status?.swapDetails;
    const solTxs = (d?.destinationChainTxHashes || []).map(txHash);
    return (
      <div className="flow">
        <div className="deposit-card">
          <div className="deposit-top">
            <QR value={depAddr} />
            <div className="deposit-copy">
              <p>
                Send exactly <b>{q.amountInFormatted} {active.originSymbol}</b> on <b>{chainName(active.originChain)}</b>.
                You'll get about <b>{q.amountOutFormatted} {dest}</b> (min {Number(q.minAmountOut) / 10 ** DEST[dest].decimals}).
              </p>
              <Copy value={depAddr} label="One-time deposit address" />
              {q.depositMemo && <Copy value={q.depositMemo} label="Memo (required)" />}
              {q.deadline && <div className="tiny muted">Refunds start if not completed by {new Date(q.deadline).toLocaleString()}.</div>}
            </div>
          </div>
        </div>

        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li key={s} className={i < idx || st === 'SUCCESS' ? 'done' : i === idx ? 'now' : ''}>{STEP_LABEL[s]}</li>
          ))}
        </ol>
        {!STEPS.includes(st as any) && <div className={`banner ${st === 'REFUNDED' ? 'warn' : 'bad'}`}>{STEP_LABEL[st]}{d?.refundReason ? ` — ${d.refundReason}` : ''}{d?.refundedAmountFormatted && d.refundedAmountFormatted !== '0' ? ` (${d.refundedAmountFormatted} ${active.originSymbol} back to ${short(String(active.res.quoteRequest.refundTo))})` : ''}</div>}
        {st === 'SUCCESS' && (
          <div className="banner good">
            Received {d?.amountOutFormatted || q.amountOutFormatted} {dest} in your Solana wallet.
            {solTxs.map((h) => (
              <a key={h} href={solscanTx(h)} target="_blank" rel="noreferrer"> View on Solscan ↗</a>
            ))}
          </div>
        )}

        {st === 'PENDING_DEPOSIT' && (
          <details className="submit">
            <summary>Already sent it? Speed things up with your tx hash</summary>
            <div className="row">
              <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Deposit transaction hash" />
              <button className="btn small" disabled={!hash.trim()} onClick={async () => {
                try { await aurora.submit(hash, depAddr, q.depositMemo); setSubmitted('Submitted — watching for it.'); }
                catch (e: any) { setSubmitted(e.message); }
              }}>Submit</button>
            </div>
            {submitted && <div className="tiny muted">{submitted}</div>}
          </details>
        )}
        <button className="btn ghost wide" onClick={reset}>{TERMINAL.has(st) ? 'New deposit' : 'Cancel & start over'}</button>
      </div>
    );
  }

  return (
    <div className="flow">
      <div className="grid2">
        <div>
          <label className="field-label" htmlFor="chain">From chain</label>
          <select id="chain" value={chain} onChange={(e) => { setChain(e.target.value); setAssetId(''); setRefundTo(''); }}>
            {chains.map((c) => <option key={c} value={c}>{chainName(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="tok">Token</label>
          <select id="tok" value={token?.assetId || ''} onChange={(e) => setAssetId(e.target.value)}>
            {chainTokens.map((t) => <option key={t.assetId} value={t.assetId}>{t.symbol}</option>)}
          </select>
        </div>
      </div>
      <label className="field-label" htmlFor="amt">Amount {token ? `(${token.symbol})` : ''}</label>
      <input id="amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
      {usd != null && <div className="tiny muted">≈ ${usd.toFixed(2)}</div>}
      <label className="field-label" htmlFor="ref">Refund address on {chainName(chain)}</label>
      <input id="ref" placeholder={`Your ${chainName(chain)} address, in case the swap can't complete`} value={refundTo} onChange={(e) => setRefundTo(e.target.value)} />

      {preview ? (
        <div className="quote">
          <div className="quote-big">≈ {preview.quote.amountOutFormatted} <span>{dest}</span></div>
          <div className="tiny muted">
            Min {Number(preview.quote.minAmountOut) / 10 ** DEST[dest].decimals} {dest} · ~{preview.quote.timeEstimate ?? '?'}s
            {preview.quote.amountOutUsd ? ` · $${Number(preview.quote.amountOutUsd).toFixed(2)}` : ''}
          </div>
          <button className="btn primary wide" disabled={!!busy} onClick={() => getQuote(false)}>
            {busy === 'lock' ? 'Locking quote…' : 'Get deposit address'}
          </button>
        </div>
      ) : (
        <button className="btn primary wide" disabled={!ready || !!busy} onClick={() => getQuote(true)}>
          {busy === 'quote' ? 'Finding best route…' : 'Get quote'}
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
