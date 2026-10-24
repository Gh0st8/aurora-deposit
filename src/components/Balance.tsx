import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { DEST, solscanAccount } from '../lib/aurora';
import { short } from './ui';

/** Live SOL + USDC balance of the receiving wallet, read straight from Solana mainnet. */
export function Balance({ owner, refreshKey }: { owner: string; refreshKey: number }) {
  const { connection } = useConnection();
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const pk = new PublicKey(owner);
      const [lamports, accts] = await Promise.all([
        connection.getBalance(pk, 'confirmed'),
        connection.getParsedTokenAccountsByOwner(pk, { mint: new PublicKey(DEST.USDC.mint!) }, 'confirmed'),
      ]);
      setSol(lamports / LAMPORTS_PER_SOL);
      setUsdc(accts.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount || 0), 0));
      setErr(false);
    } catch {
      setErr(true);
    }
  }, [connection, owner]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="balance">
      <div className="balance-head">
        <span>Receiving wallet</span>
        <a href={solscanAccount(owner)} target="_blank" rel="noreferrer" className="mono">{short(owner, 4)}</a>
      </div>
      <div className="balance-row">
        <div><b>{sol == null ? '—' : sol.toFixed(4)}</b><span>SOL</span></div>
        <div><b>{usdc == null ? '—' : usdc.toFixed(2)}</b><span>USDC</span></div>
        <button className="btn ghost small" onClick={load} aria-label="Refresh balance">↻</button>
      </div>
      {err && <div className="muted tiny">Balance unavailable from the public RPC right now — deposits still work.</div>}
    </div>
  );
}
