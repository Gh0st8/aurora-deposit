import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { DestKey } from './lib/aurora';
import { PersistentFlow } from './components/PersistentFlow';
import { QuoteFlow } from './components/QuoteFlow';
import { Balance } from './components/Balance';
import { isSolanaAddress } from '../api/aurora';

type Mode = 'permanent' | 'once';

export default function App() {
  const { publicKey } = useWallet();
  const [manual, setManual] = useState('');
  const [dest, setDest] = useState<DestKey>('USDC');
  const [mode, setMode] = useState<Mode>('permanent');
  const [refreshKey, setRefreshKey] = useState(0);

  const recipient = publicKey?.toBase58() || (isSolanaAddress(manual.trim()) ? manual.trim() : '');
  const arrived = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9945FF" /><stop offset="1" stopColor="#14F195" /></linearGradient></defs>
            <path d="M32 10 L52 52 H12 Z" fill="none" stroke="url(#lg)" strokeWidth="7" strokeLinejoin="round" />
          </svg>
          <span>Aurora Deposit</span>
        </div>
        <WalletMultiButton />
      </header>

      <main>
        <section className="hero">
          <h1>Fund your Solana wallet<br /><em>from any chain.</em></h1>
          <p>
            Bitcoin, Ethereum, Base, Tron, TON and 20+ more. One address, no bridge, no gas token juggling.
            It lands as SOL or USDC in the wallet you connect.
          </p>
        </section>

        <section className="card">
          {!recipient ? (
            <div className="connect">
              <p>Connect Phantom (or any Solana wallet) to choose where funds land.</p>
              <WalletMultiButton />
              <div className="or">or paste a Solana address</div>
              <input placeholder="Solana address" value={manual} onChange={(e) => setManual(e.target.value)} />
              {manual && !recipient && <div className="error tiny">That isn't a valid Solana address.</div>}
            </div>
          ) : (
            <>
              <Balance owner={recipient} refreshKey={refreshKey} />

              <label className="field-label">Receive on Solana</label>
              <div className="seg">
                {(['USDC', 'SOL'] as DestKey[]).map((d) => (
                  <button key={d} className={dest === d ? 'on' : ''} onClick={() => setDest(d)}>{d}</button>
                ))}
              </div>

              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={mode === 'permanent'} className={mode === 'permanent' ? 'on' : ''} onClick={() => setMode('permanent')}>
                  Permanent address
                </button>
                <button role="tab" aria-selected={mode === 'once'} className={mode === 'once' ? 'on' : ''} onClick={() => setMode('once')}>
                  One-time swap
                </button>
              </div>
              <p className="muted tiny">
                {mode === 'permanent'
                  ? 'A reusable address that is yours forever — like an exchange deposit address, but it pays out to your own Solana wallet.'
                  : 'Exact quote with a guaranteed minimum, a refund address, and step-by-step tracking.'}
              </p>

              {mode === 'permanent'
                ? <PersistentFlow key={`p-${recipient}-${dest}`} recipient={recipient} dest={dest} onArrived={arrived} />
                : <QuoteFlow key={`q-${recipient}-${dest}`} recipient={recipient} dest={dest} onArrived={arrived} />}
            </>
          )}
        </section>

        <section className="how">
          <h2>How it works</h2>
          <ol>
            <li><b>Solana is the destination.</b> Your connected wallet's public key is the recipient; balances are read live from Solana mainnet.</li>
            <li><b>Aurora Intents gives you a deposit address</b> on the chain you're sending from — permanent (Intents Deposits) or per-quote (1Click Swap).</li>
            <li><b>NEAR Intents solvers</b> compete to fill the swap and deliver native SOL or SPL USDC to your wallet, usually in under a minute from EVM chains.</li>
            <li><b>If anything goes wrong</b>, one-time swaps refund to the address you gave on the source chain.</li>
          </ol>
          <p className="tiny muted">
            Real funds: Aurora Intents settles on Solana <b>mainnet</b> only (there is no devnet route). Try it with a few dollars.
            Non-custodial — this app never holds your funds or keys. Open source, MIT.
          </p>
        </section>
      </main>

      <footer className="foot tiny muted">
        Powered by <a href="https://intents.aurora.dev" target="_blank" rel="noreferrer">Aurora Intents</a> ·{' '}
        <a href="https://gitlab.com/Gh0st8/aurora-deposit" target="_blank" rel="noreferrer">Source</a>
      </footer>
    </div>
  );
}
