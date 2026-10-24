import { useEffect, useState } from 'react';
import { aurora, chainName, DEST, DestKey, fromUnits, PersistentDeposit, solscanTx, SOURCE_CHAINS } from '../lib/aurora';
import { Copy, QR, usePoll } from './ui';

type Row = PersistentDeposit & { stage: 'received' | 'success' | 'failed' };

/**
 * Aurora Intents Deposits — Persistent Addresses.
 * One permanent address per (wallet, source chain, SOL|USDC). Send anything supported to it, any time.
 */
export function PersistentFlow({ recipient, dest, onArrived }: { recipient: string; dest: DestKey; onArrived: () => void }) {
  const [chain, setChain] = useState('evm');
  const [addr, setAddr] = useState<{ depositAddress: string; memo?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  const cacheKey = `ad:pa:${recipient}:${chain}:${dest}`;

  useEffect(() => {
    setRows([]);
    setError('');
    const cached = localStorage.getItem(cacheKey);
    setAddr(cached ? JSON.parse(cached) : null);
  }, [cacheKey]);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const r = await aurora.persistent(recipient, chain, DEST[dest].id);
      const v = { depositAddress: r.depositAddress, memo: r.memo };
      localStorage.setItem(cacheKey, JSON.stringify(v));
      setAddr(v);
    } catch (e: any) {
      setError(e.status === 403
        ? 'This API key is not approved for persistent addresses yet. Use “One-time swap” meanwhile.'
        : e.message);
    } finally {
      setLoading(false);
    }
  }

  usePoll(async () => {
    if (!addr) return;
    const [rec, ok, bad] = await Promise.all([
      aurora.pstatus(addr.depositAddress, 'received'),
      aurora.pstatus(addr.depositAddress, 'success'),
      aurora.pstatus(addr.depositAddress, 'failed'),
    ]);
    const next: Row[] = [
      ...ok.deposits.map((d) => ({ ...d, stage: 'success' as const })),
      ...bad.deposits.map((d) => ({ ...d, stage: 'failed' as const })),
      ...rec.deposits.map((d) => ({ ...d, stage: 'received' as const })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRows((prev) => {
      if (next.filter((r) => r.stage === 'success').length > prev.filter((r) => r.stage === 'success').length && prev.length) onArrived();
      return next;
    });
  }, 10_000, !!addr, [addr?.depositAddress]);

  const meta = SOURCE_CHAINS.find((c) => c.id === chain);

  return (
    <div className="flow">
      <label className="field-label">Send from</label>
      <div className="chips">
        {SOURCE_CHAINS.map((c) => (
          <button key={c.id} className={`chip ${chain === c.id ? 'on' : ''}`} onClick={() => setChain(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {meta?.hint && <p className="muted tiny">{meta.hint}</p>}

      {!addr ? (
        <button className="btn primary wide" onClick={generate} disabled={loading}>
          {loading ? 'Creating your address…' : `Get my ${meta?.label} address for ${dest}`}
        </button>
      ) : (
        <div className="deposit-card">
          <div className="deposit-top">
            <QR value={addr.depositAddress} />
            <div className="deposit-copy">
              <p>
                Send any supported token on <b>{meta?.label}</b> to this address. It arrives in your wallet as{' '}
                <b>{dest}</b> on Solana. The address is permanent — save it and reuse it.
              </p>
              <Copy value={addr.depositAddress} label="Your deposit address" />
              {addr.memo && <Copy value={addr.memo} label="Memo (required)" />}
            </div>
          </div>
          <p className="muted tiny">
            Tip: start with a small amount. Deposits below the network minimum may not be processed.
          </p>
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {addr && (
        <div className="activity">
          <div className="activity-head">
            <span>Activity</span>
            <span className="pulse">watching</span>
          </div>
          {rows.length === 0 ? (
            <div className="muted tiny">No deposits yet. New ones show up here automatically.</div>
          ) : (
            rows.map((r) => (
              <div key={r.stage + r.tx_hash} className={`act ${r.stage}`}>
                <div>
                  <b>{fromUnits(r.amount, r.decimals)}</b>{' '}
                  <span className="muted">
                    {r.stage === 'received' ? `received from ${chainName(r.fromChain) || 'source chain'}` : r.stage === 'success' ? `delivered to Solana` : 'failed'}
                  </span>
                </div>
                <div className="tiny muted">{new Date(r.created_at).toLocaleString()}</div>
                {r.stage === 'success' && r.destinationChain === 'sol' && (
                  <a className="tiny" href={solscanTx(r.tx_hash)} target="_blank" rel="noreferrer">View Solana transaction ↗</a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
