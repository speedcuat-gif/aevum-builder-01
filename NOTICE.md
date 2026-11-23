# NOTICE — third-party software and attribution

PayLink's own code (contracts, scripts, web UI, docs) is original work,
written for the Aevum Builder Challenge #1, licensed MIT (see `LICENSE`).

It builds on the following third-party software, used as libraries/tools
and not copied into this repo's source (except where noted):

- **ethers.js v6.17.0** (MIT) — Ethereum library used by the scripts and
  the web UI (loaded from the jsdelivr CDN in `web/index.html`).
  https://github.com/ethers-io/ethers.js
- **solc-js 0.8.39** (Apache-2.0) — Solidity compiler used by
  `scripts/compile.mjs`. https://github.com/ethereum/solc-js
- **Hardhat 2.29.2** (MIT) — local Ethereum network for the demo run
  (`npx hardhat node`), dev dependency only.
  https://github.com/NomicFoundation/hardhat
- **dotenv 18** (BSD-2-Clause) — `.env` loading for the scripts.
  https://github.com/motdotla/dotenv
- **DejaVu Sans Bold** (free license, see
  `/usr/share/fonts/truetype/dejavu/`) — caption font burned into
  `web/demo.mp4` by ffmpeg; the font file itself is not shipped.

Design references (read, not copied — no code, text, or assets taken):

- **Aevum starter kit** — docs at https://aevum-starter-kit.vercel.app/docs,
  source https://github.com/qday-io/aevum-starter-kit (MIT, © 2026 PQA Labs).
  Used for the Aevum network facts (chain 44005, RPC, tUSD8 address and
  token interfaces, EVM Shanghai, 1,000-block log limit, legacy txs) and
  as a design reference for the Checkout pattern. PayLink's contract,
  scripts, and UI are all written from scratch.
- **QDay / Aevum documentation** — the Medium faucet guide and the
  DoraHacks challenge page (https://dorahacks.io/hackathon/qday/detail)
  for the challenge rules, timeline, and judging criteria.
- **tUSD8** is QDay's testnet stablecoin
  (`0x456569838f1d43009A91ebA4263147Afd7233483`); `contracts/MockUSD8.sol`
  is an original local-test stand-in with the same interfaces, not a copy
  of the real token's code.
- The Hardhat local chain uses the standard public Hardhat test accounts
  (mnemonic "test test … junk") — public test keys, never real funds.

No starter-kit code, images, or text are reproduced in this repository.
