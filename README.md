# Aurora Deposit — fund your Solana wallet from any chain

**Live demo:** https://aurora-deposit.vercel.app
**Built for:** Encode Club Solana Hackathon 2026 — Aurora Intents bounty + Best Consumer App on Solana.

Getting money *into* Solana is still the hardest part of using it: pick a bridge, buy gas on the source chain,
approve, wait, hope. Aurora Deposit removes all of that. Connect Phantom (or any Solana wallet), choose **SOL** or
**USDC**, and get a deposit address on the chain your money already lives on — Bitcoin, Ethereum, Base, Arbitrum,
Tron, TON, NEAR, Sui, XRP, Dogecoin, Zcash and more. Send to it like you'd send to an exchange. It lands in your
Solana wallet.

## Features

- **Permanent address (Aurora Intents Deposits — Persistent Addresses).** One reusable address per source chain,
  tied to your Solana wallet and your chosen asset. All EVM chains share one address. Live activity feed of
  received → delivered deposits with Solscan links.
- **One-time swap (Aurora Intents 1Click Swap API).** Pick any of 200+ supported tokens, see a live quote with a
  guaranteed minimum, enter a **refund address** on the source chain, get a unique deposit address + QR, and watch
  live status: `PENDING_DEPOSIT → KNOWN_DEPOSIT_TX → PROCESSING → SUCCESS` (or `INCOMPLETE_DEPOSIT` / `REFUNDED` /
  `FAILED`, with the refund reason and amount). On success the Solana transaction links to Solscan.
- **Speed-up:** paste your deposit tx hash to notify 1Click (`/api/deposit/submit`).
- **Live Solana balances** of the receiving wallet (SOL + USDC) that refresh when a deposit lands.
- Wallet Adapter (Phantom, Solflare, Backpack and any Wallet Standard wallet), or paste an address.
- Non-custodial: the app never holds funds or keys. Resumes an in-flight swap after a page refresh.

## How Solana powers it

- **Solana is the destination.** Every deposit pays out as native SOL or SPL USDC
  (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) to the user's Solana public key. Aurora/NEAR Intents solvers
  settle the final leg as a regular Solana transaction, which we link on Solscan.
- **Identity = your Solana wallet.** The connected wallet's public key (via `@solana/wallet-adapter-react`) is
  both the `recipient` and the per-user `sender` id for persistent addresses, so each wallet gets its own stable
  deposit addresses — no accounts, no sign-up.
- **On-chain reads.** `@solana/web3.js` reads SOL and USDC balances directly from Solana mainnet RPC to confirm
  arrival.
- **Solana as a source too.** Users can also fund from another Solana wallet/exchange (any supported SPL token)
  and have it converted to SOL or USDC.

> **Mainnet only.** Aurora Intents / NEAR Intents settle on Solana **mainnet**; there is no devnet route. Test with
> a few dollars. The UI says this too.

## Architecture

```
Browser (React + Vite + Solana Wallet Adapter)
  │  /api/aurora?op=tokens|quote|status|submit|persistent|pstatus
  ▼
Vercel function api/aurora.ts  (allow-listed proxy, API key in env, Solana recipient validation,
  │                             destination pinned to SOL/USDC on Solana, Retry-After passthrough)
  ▼
Aurora Intents API  https://intents-api.aurora.dev  ──► NEAR Intents solvers ──► Solana mainnet
```

Aurora Intents endpoints used (docs: https://docs.intents.aurora.dev):

| Purpose | Endpoint |
| --- | --- |
| Supported tokens | `GET /api/tokens/{apiKey}` |
| Quote + one-time deposit address | `POST /api/quote/{apiKey}` (`dry: true` to preview, `dry: false` to get `depositAddress`) |
| Swap status | `GET /api/status/{apiKey}?depositAddress=` |
| Notify deposit tx | `POST /api/deposit/submit/{apiKey}` |
| Persistent deposit address | `POST /api/persistent-deposit-address/{apiKey}` |
| Persistent deposit activity | `GET /api/persistent-deposit-status/{apiKey}?type=received\|success\|failed&address=` |

Polling follows Aurora's rate-limit guidance: swap status every 6 s, persistent activity every 10 s, only while
the tab is visible, and the token list is cached for 5 minutes.

```
api/aurora.ts                 proxy + validation (also used by the Vite dev server)
src/lib/aurora.ts             typed client, unit conversion, chain names
src/components/PersistentFlow  permanent-address flow
src/components/QuoteFlow       quote → deposit address → status stepper, refunds
src/components/Balance         live SOL/USDC balance from Solana RPC
```

## Run it locally

```bash
git clone https://github.com/Gh0st8/aurora-deposit
cd aurora-deposit
cp .env.example .env      # paste a free API key from https://studio.aurora.dev
npm install
npm run dev               # http://localhost:5173 (the dev server also serves /api/aurora)
```

Environment (`.env.example`):

| Var | Required | What |
| --- | --- | --- |
| `AURORA_API_KEY` | yes | Free, instant key from Intents Studio. Server-side only. |
| `VITE_SOLANA_RPC` | no | Solana mainnet RPC for balance reads (defaults to the public endpoint). |

Deploy: import the repo in Vercel (framework: Vite) and set `AURORA_API_KEY`.

## Demo steps

1. Open the live demo and connect Phantom.
2. Choose **USDC** → **Permanent address** → **Ethereum & EVM** → *Get my address*. Note the same address works
   on Base, Arbitrum, Polygon, etc.
3. Send ~$2 of ETH/USDC on Base to it. Watch *Activity* go from received → delivered, then the USDC balance tick up.
4. Switch to **One-time swap**: Bitcoin → BTC, amount, your BTC refund address → *Get quote* → *Get deposit address*.
   Watch the status stepper; on success open the Solana tx on Solscan.

Fees: Aurora's protocol fee applies per their docs (integrator fee on this key: 0 bps). No extra fee is added by this app.

## License

MIT — see [LICENSE](LICENSE).
