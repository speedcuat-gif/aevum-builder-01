# PayLink — escrowed invoices in tUSD8 on Aevum testnet

Entry for the **Aevum Builder Challenge #1** on DoraHacks
($1,500 USDT total: 1st $800, 2nd $500, 3rd $200 — submissions close
**11 Dec 2026, 16:00 WIB / 08:00 UTC**; judging 12–14 Dec; Demo Day 15 Dec).

**What it is:** a stablecoin-payment app for freelancers and small merchants.
A merchant creates an invoice in **tUSD8** (the Aevum testnet stablecoin),
a buyer pays it into **escrow**, and the money releases only when the buyer
confirms delivery — or to the merchant after a 7-day confirm window if the
buyer goes quiet. The merchant can refund any time before release; the buyer
can open a dispute and the merchant resolves it (refund or release).

Pay three ways:

1. **Approve + pay** — the standard two-transaction flow.
2. **EIP-2612 permit** — approval and payment in a single transaction.
3. **Gasless EIP-3009** — the buyer signs an authorization off-chain and a
   relayer (or an AI agent, `scripts/agent-pay.mjs`) submits it; the buyer
   pays **no gas**. The signature's nonce is bound to the invoice id
   (`bytes32(id)`), so it cannot be replayed for another invoice, and the
   signature window is capped at 1 hour.

No admin keys, no upgradeability, no fees taken by the contract.

## Status

| Item | State |
|---|---|
| Contract + UI + scripts + docs | ✅ Done, tested end to end locally |
| Local testnet run (Hardhat, chain 31337) | ✅ All 4 flows pass, see [Local test results](#local-test-results) |
| **Aevum testnet deploy (chain 44005)** | ⏳ **BLOCKED — needs a funded test wallet** (see below) |
| Demo video | ✅ 20 s captioned walkthrough: `web/demo.mp4` (+ `DEMO_SCRIPT.md`) |
| Live deployment / Docker image | ⏳ Dockerfile written, **not built/tested** (no Docker in this environment) |
| DoraHacks submission | ❌ Not submitted (by design — the submitter handles it) |
| YouTube upload of the video | ❌ Needs the user's Google account |
| Top 5 Demo Day (15 Dec, live video call) | ⚠️ Needs the user to present (3–5 min) if PayLink is a finalist |

### Aevum deploy blocker (the one thing stopping the real deployment)

A fresh throwaway **test-only** deployer wallet was generated offline and saved
in `.env` (gitignored, mode 600 — the private key is never committed or
shared):

- **Deployer address: `0xc8971Cb2ED298884a789C543B1Bb02F7fBC001D6`**
- It holds **0 tQDAY / 0 tUSD8** and cannot deploy until funded.

Funding route: the **QDay Discord faucet** — join the QDay Discord, react ✅
in `#verify` for the Verified role, then type `/faucet <address>` — pays
**1 tQDAY + 5 tUSD8, once per Discord account and once per address**, usually
within seconds. **This needs the user's Discord account** (the agent has
none). The web faucet (`faucet.qday.info`) does **not** work for fresh wallets
— it only pays addresses holding ~0.0001 ETH or 1 USDT/USDC on Ethereum
mainnet.

Once funded, deploy in one command (see [Deploy to Aevum](#deploy-to-aevum)),
then paste the contract address into `web/app.js` (`PAYLINK_DEFAULT`) and
re-record the screenshots/video against the real testnet.

## Architecture

```
                ┌──────────────┐  create / pay / confirm / dispute
  Merchant/     │  web/ UI     │  ───────────────────────────────┐
  Buyer (wallet)│  static page │  read via public RPC, no wallet │
                │  ethers 6    │  needed to browse invoices      │
                └──────┬───────┘                                 │
                       │                                         ▼
                ┌──────┴───────┐   EIP-3009 signature (off-chain)
                │ scripts/     │   ───────────────────────────────┐
                │ agent-pay    │   relayer submits, buyer pays    │
                │ .mjs         │   no gas                         │
                └──────┬───────┘                                 │
                       ▼                                         ▼
              ┌────────────────────────────────────────────────────────┐
              │  PayLink.sol on Aevum testnet (chain 44005)            │
              │  createInvoice · payInvoice · payWithPermit ·          │
              │  payWithAuthorization · confirmDelivery ·              │
              │  claimAfterTimeout · refundInvoice · openDispute ·     │
              │  resolveDispute · cancelInvoice · getInvoice           │
              │        │                                               │
              │        ▼                                               │
              │  tUSD8 0x456569838f1d43009A91ebA4263147Afd7233483       │
              │  (6 decimals, EIP-2612 permit, EIP-3009, EIP-712       │
              │   domain "tUSD8" v2) — funds sit in escrow here        │
              └────────────────────────────────────────────────────────┘
```

**Invoice lifecycle:** Created → Paid → (Confirmed → Released) **or**
(Paid → claim after 7 days → Released) **or** (Paid → Refunded) **or**
(Paid → Disputed → Resolved: Refunded / Released). Created → Cancelled
by the merchant before payment. Amount cap 1,000,000 tUSD8 per invoice,
max invoice lifetime 30 days, confirm window 7 days. Reentrancy guard on
every state-changing external call.

**Safety / trust controls (judging criterion):** least privilege by design —
only the payer can confirm/dispute, only the payee can claim/refund/resolve/
cancel; no owner, no pause, no upgrade, no fee extraction; EIP-3009
authorizations are bound to one invoice id with a 1-hour window; the relayer
can only submit `payWithAuthorization` for the invoice the buyer signed for.
All state changes emit events (full audit trail, explorer-verifiable).

## Network facts (Aevum testnet)

| | |
|---|---|
| Chain | QDay Aevum Testnet, **chain ID 44005** |
| RPC | `https://rpc-test.qday.info` (HTTPS only, no WebSocket) |
| Explorer | `https://explorer-test.qday.info` |
| Gas token | tQDAY (18 decimals, ~1 gwei; 1 tQDAY covers hundreds of calls) |
| Stablecoin | **tUSD8 `0x456569838f1d43009A91ebA4263147Afd7233483`**, 6 decimals, EIP-2612 + EIP-3009, EIP-712 domain `tUSD8` v2 |
| EVM version | **Shanghai** — compile with `evm_version: shanghai` (Cancun opcodes MCOPY/TSTORE/TLOAD/blob do not exist; plain anvil/Hardhat runs Cancun, so bad bytecode passes locally) |
| Transactions | Legacy (type 0), ~1 gwei |
| `eth_getLogs` | **1,000-block limit** — the UI chunks event reads (see `web/app.js`, `CHUNK = 1000`) |
| Source verification | **Not working on the explorer yet** (`forge verify-contract` fails) — share the contract address + exact commit in the submission instead |
| Faucet contract | `0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5` |

Sources: [Aevum starter kit docs](https://aevum-starter-kit.vercel.app/docs)
([source](https://github.com/qday-io/aevum-starter-kit), MIT) and the
[DoraHacks challenge page](https://dorahacks.io/hackathon/qday/detail).
All code in this repo is original; the starter kit informed the network/token
facts and the Checkout design pattern only — nothing was copied (see
`NOTICE.md`).

## Repo layout

```
contracts/
  PayLink.sol      escrowed-invoice contract (+ ITUSD8 interface)
  MockUSD8.sol     LOCAL-TEST stand-in for tUSD8 (ERC-20 6dp, permit +
                   EIP-3009, anyone can mint, EIP-712 "MockUSD8" v1).
                   Local tests only — never deploy to Aevum.
scripts/
  compile.mjs      solc-js, evmVersion Shanghai, optimizer runs 200
                   → artifacts/PayLink.json, artifacts/MockUSD8.json
  deploy.mjs       deploys PayLink to Aevum (or --local); writes
                   deployments/<chainId>.json; key from DEPLOYER_KEY/--key
  demo-flow.mjs    end-to-end demo: deploys fresh on --local, or uses
                   --paylink/--token on a live network; 4 flows
  agent-pay.mjs    agent gasless pay for one invoice (buyer signs EIP-3009
                   off-chain, relayer submits)
  check-setup.mjs  chain/block/gas/balances check (safe vs local node;
                   do not run vs the real Aevum RPC until access is approved)
  serve.mjs        tiny static server (node:http only), serves web/ +
                   deployments/, default port 8080
web/
  index.html       static UI (no build step)
  app.js           ethers 6.17.0 via jsdelivr importmap; connect wallet
                   (adds/switches to Aevum 44005), create/find/list
                   invoices, pay (approve+pay or permit), confirm /
                   dispute / refund / claim / resolve, activity log with
                   explorer links. URL params:
                   ?rpc=…&paylink=0x…&token=0x…&from=<deploy block>
  screenshots/     UI screenshots from the local demo run
  demo.mp4         20 s captioned video walkthrough (local run)
hardhat.config.cjs Hardhat 2, solidity 0.8.20, evmVersion Shanghai,
                   networks hardhat (31337) + aevum (44005, DEPLOYER_KEY)
Dockerfile         serves the UI (node:24-alpine + scripts/serve.mjs).
                   Written, NOT built/tested — no Docker in this env.
DEMO_SCRIPT.md     narration script for the 3–5 min video pitch
NOTICE.md          third-party licenses / attribution
```

## Local test results

Verified 2026-11-23 on a local Hardhat node (`http://127.0.0.1:8545`,
chain 31337). Reproduce with the commands in
[Run the local demo](#run-the-local-demo).

- `node scripts/demo-flow.mjs --rpc http://127.0.0.1:8545 --local` —
  **all 4 flows green**.
- `node scripts/agent-pay.mjs` (standalone, invoice #5) — **green**:
  gasless pay, buyer paid no gas, relayer submitted.
- Perft-equivalent contract checks: `PayLink` bytecode **8,976 bytes**;
  `compile` passes; all event flows verified on-chain (see tx hashes).

Latest local deployment (Hardhat only — **not** Aevum):

| | |
|---|---|
| PayLink | `0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44` |
| MockUSD8 (test stand-in) | `0x59b670e9fA9D0A427751Af201D676719a970857b` (name `MockUSD8`, symbol `tUSD8-mock`, 6 decimals) |
| Accounts | merchant `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, buyer `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, relayer `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (standard public Hardhat test accounts) |

Flow results (invoice # → result, tx hashes from the local chain):

| Flow | What happened | Key tx |
|---|---|---|
| 1 — approve + pay | Invoice #1, 5.0 tUSD8, buyer confirms → **Released**, merchant balance 5.0 | create `0xda4bffce…49076b9`, pay `0x3adfc1b1…1742653e`, confirm/release `0x3cf61f6c…f2` |
| 2 — permit + timeout claim | Invoice #2, 2.5 tUSD8, permit pay, merchant claims after 7-day window → **Released** | create `0xf45516a6…553e333`, pay `0xf2e327a4…4406217c`, claim `0x24ce3add…34134` |
| 3 — gasless EIP-3009 + refund | Invoice #3, 1.0 tUSD8, relayer submits buyer's signature, merchant refunds → **Refunded**, buyer balance back to 9992.5 | create `0x1103ca2a…732de6`, pay `0xa040acbf…78d849a7`, refund `0x9352ca20…c069` |
| 4 — dispute → resolve (refund) | Invoice #4, 0.75 tUSD8, buyer disputes, merchant resolves with refund → **Refunded** | create `0xa10c8230…9624f5c`, pay `0xbde32011…5d9a`, dispute `0xd8cd0818…85`, resolve `0x608a6534…1f4569` |
| 5 — standalone agent-pay | Invoice #5, 1.5 tUSD8, `scripts/agent-pay.mjs` alone → **Paid** (escrowed), buyer paid no gas | create `0xf557cf6d…76b9a6`, gasless pay `0xff27bda1…c7eb2be` |

Final on-chain states: #1 Released, #2 Released, #3 Refunded, #4 Refunded,
#5 Paid. (Full hashes: query the local node's events, or re-run the demo —
every run prints them. The UI screenshots in `web/screenshots/` show these
5 invoices live.)

Bugs found and fixed during the local test:

- `ethers v6 Wallet.fromPhrase(mnemonic, path)` ignores the path — all
  derived accounts were #0 and nonces collided. Fixed by deriving from the
  seed (`HDNodeWallet.fromSeed(...).derivePath(...)`).
- `payWithAuthorization` originally did `transferFrom` after
  `receiveWithAuthorization` had already pulled the funds — reverted
  ("allowance") because the buyer never approved. Fixed by splitting into
  `_recordPaid` (status only) and doing `transferFrom` only in
  `payInvoice`/`payWithPermit`.
- Wall-clock deadlines broke after the 7-day time-travel in flow 2 —
  the demo and `agent-pay.mjs` now use the **chain** clock for deadlines
  and signature windows.

## Run the local demo

```bash
npm install
npm run compile                    # solc-js, Shanghai, → artifacts/
npx hardhat node                   # terminal 1: local chain 127.0.0.1:8545
npm run demo                       # terminal 2: deploys fresh + 4 flows
npm run serve                      # terminal 2: UI on http://127.0.0.1:8080
```

Open the UI against the local deployment (replace the addresses with the ones
`npm run demo` prints):

```
http://127.0.0.1:8080/?rpc=http://127.0.0.1:8545&paylink=0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44&token=0x59b670e9fA9D0A427751Af201D676719a970857b&from=0
```

Gasless pay for one invoice (buyer signs off-chain, relayer submits):

```bash
node scripts/agent-pay.mjs --rpc http://127.0.0.1:8545 \
  --paylink 0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44 \
  --token 0x59b670e9fA9D0A427751Af201D676719a970857b \
  --id 5 --amount 1500000 \
  --buyer-key <BUYER_KEY> --relayer-key <RELAYER_KEY> \
  --token-name MockUSD8 --token-version 1
```

## Deploy to Aevum

```bash
cp .env.example .env        # fill DEPLOYER_KEY with the TEST-ONLY key
# fund 0xc8971Cb2ED298884a789C543B1Bb02F7fBC001D6 via the QDay Discord faucet:
#   /faucet 0xc8971Cb2ED298884a789C543B1Bb02F7fBC001D6   (1 tQDAY + 5 tUSD8)
npm run deploy              # → deployments/44005.json (address + tx hash)
```

Then:

1. Paste the deployed address into `web/app.js` (`PAYLINK_DEFAULT`).
2. Open the UI with `?rpc=https://rpc-test.qday.info&paylink=0x…&from=<deploy block>`
   and re-run the flows against the real testnet (create → pay → confirm,
   plus one gasless pay via `agent-pay.mjs` with `--token-name tUSD8
   --token-version 2`).
3. Record the Aevum contract address + tx hashes here and in the DoraHacks
   submission (explorer links: `https://explorer-test.qday.info/tx/0x…`).
4. Re-record the screenshots/video against the real deployment.

**Testnet only — no real money.** The deployer key in `.env` is a fresh
throwaway; never reuse it anywhere else, never commit `.env`.

## Demo video

- `web/demo.mp4` — 20 s, 1440×762, H.264, silent captioned walkthrough built
  from the local demo run's real UI screenshots (`web/screenshots/`):
  (1) landing + create-invoice form, (2) five invoices live from the
  contract, (3) full lifecycle, (4) the three pay methods.
- The frames are the **real UI reading the real local deployment** (Hardhat
  chain 31337, MockUSD8 stand-in for tUSD8) — not mockups. The Aevum
  deployment is pending funding (see above); re-record against it once live.
- `DEMO_SCRIPT.md` — the 3–5 min narration script for the video pitch.
  A narrated version still needs to be recorded, and uploading to YouTube
  needs the user's Google account.

## DoraHacks submission checklist

Required package (from the challenge page):

- [x] **Technical — public GitHub repo** with clean readable code (this repo;
  push it to GitHub — the remote is not configured yet)
- [x] **Aevum Blockchain Integration evidence** — PayLink contract (Solidity,
  Shanghai), tUSD8 integration (permit + EIP-3009), on-chain activity
  (tx hashes above; Aevum tx hashes pending the real deploy)
- [ ] **Live Deployment** — functional demo / prototype interface /
  packaged Docker image. UI exists (`web/`, `scripts/serve.mjs`);
  Dockerfile written but **not built/tested** (no Docker here); no public
  hosting yet — needs a host (Vercel/Netlify/Railway/etc.) or a built image
- [x] **Project Documentation** — this README (problem, architecture, core
  workflows, technologies, reproduction steps)
- [x] **Video Pitch & Demo (draft)** — `web/demo.mp4` (20 s silent) +
  `DEMO_SCRIPT.md`; a full 3–5 min narrated pitch still needs recording
  and a YouTube upload (user's account)
- [ ] **Top 5 Demo Day (15 Dec 2026, 14:00 HKT, live video call)** —
  only if PayLink is a finalist; the user presents (3–5 min)
- [x] No malicious code — original code only (see `NOTICE.md`)

## Known limitations

- Aevum deploy is blocked on test-token funding (Discord faucet, user's
  account) — see [Status](#status).
- Explorer source verification does not work yet — submit addresses +
  exact commit instead.
- Dockerfile is written but untested (no Docker daemon in this environment).
- The UI's write actions need a wallet (MetaMask / injected provider);
  reads work without one.
- The demo video is a silent captioned walkthrough of the local run, not
  a narrated pitch and not yet on the real testnet.
- `scripts/check-setup.mjs` must not be run against the real Aevum RPC
  until RPC access is approved (it is safe against a local Hardhat node).
- `forge`/`cast` are not installed here; compilation and deployment use
  solc-js + ethers only. Docker is not available here.

## License

MIT — see `LICENSE`. Third-party attributions in `NOTICE.md`.
