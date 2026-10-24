import { Buffer } from 'buffer';
(globalThis as any).Buffer ??= Buffer;

import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import './styles.css';
import App from './App';

export const RPC = (import.meta.env.VITE_SOLANA_RPC as string) || 'https://solana-rpc.publicnode.com';

function Root() {
  // Phantom, Solflare, Backpack and other Wallet Standard wallets are detected automatically.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
