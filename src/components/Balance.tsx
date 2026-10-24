import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { DEST, solscanAccount } from '../lib/aurora';
import { short } from './ui';

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hVvbsiqW5xWH25efTNsLJA8knL');

/** Live SOL + USDC balance of the receiving wallet, read straight from Solana mainnet. */
export function Balance({ owner, refreshKey }: { owner: string; refreshKey: number }) {
  const { connection } = useConnection();
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const pk = new PublicKey(owner);
      // Public RPCs reject indexed calls (getTokenAccountsByOwner), so derive the USDC associated token
      // account and read it with getAccountInfo. A missing account just means a zero balance.
      const [ata] = PublicKey.findProgramAddressSync(
        [pk.toBuffer(), TOKEN_PROGRAM.toBuffer(), new PublicKey(DEST.USDC.mint!).toBuffer()],
        ATA_PROGRAM,
      );
      const [lamports, info] = await Promise.all([
        connection.getBalance(pk, 'confirmed'),
        connection.getParsedAccountInfo(ata, 'confirmed'),
      ]);
      setSol(lamports / LAMPORTS_PER_SOL);
      const parsed: any = info.value?.data;
      setUsdc(parsed?.parsed?.info?.tokenAmount ? Number(parsed.parsed.info.tokenAmount.uiAmountString) : 0);
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
        <a href={solscanAccount(owner)} target="_blank" rel="noreferrer" className="addr">{short(owner, 4)}</a>
      </div>
      <div className="balance-row">
        <div><b>{sol == null ? '—' : sol.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b><span>SOL</span></div>
        <div><b>{usdc == null ? '—' : usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b><span>USDC</span></div>
        <button className="btn ghost small" onClick={load} aria-label="Refresh balance">↻</button>
      </div>
      {err && <div className="muted tiny">Balance unavailable from the public RPC right now — deposits still work.</div>}
    </div>
  );
}
