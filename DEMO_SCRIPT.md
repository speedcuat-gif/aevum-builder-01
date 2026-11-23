# PayLink — demo video script (3–5 min pitch)

## What exists now

- **`web/demo.mp4`** (20 s, 1440×762, H.264, silent, captioned) — a
  walkthrough built from the real UI screenshots of the local demo run
  (`web/screenshots/`). Four beats, 5 s each:
  1. Landing + create-invoice form — "PayLink — escrowed invoices in tUSD8
     on Aevum testnet"
  2. Invoice list — "Five invoices, live from the contract — Paid,
     Released, Refunded"
  3. Invoice detail + activity — "Full lifecycle: pay, confirm, claim,
     refund, dispute"
  4. Full page — "Pay three ways: approve+pay, EIP-2612 permit, gasless
     EIP-3009"
- The frames are the **real UI reading the real local deployment**
  (Hardhat chain 31337, MockUSD8 stand-in for tUSD8) — not mockups.
  The Aevum deployment is pending test-token funding (see README);
  **re-record against the real testnet once deployed** so the video
  shows the Aevum explorer links and the real tUSD8 token.

## What still needs doing (user's steps)

1. Record a narrated 3–5 min pitch (script below) — screen-record the UI
   on the real Aevum deployment, or narrate over `web/demo.mp4`.
2. Upload it to YouTube (needs the user's Google account) and put the
   link in the DoraHacks submission.
3. If PayLink makes the Top 5: present live on the Demo Day video call,
   15 Dec 2026 14:00 HKT (3–5 min, same beats as below).

## Narration script (~3 min)

**[0:00–0:20] The problem.**
"Freelancers get paid late — or never. A client says 'send the invoice',
the work ships, and then… silence. Escrow fixes this, but existing
escrow tools want your email, your ID, and a 10% fee. PayLink is escrow
for stablecoin invoices on Aevum — no account, no fee, just a contract."

**[0:20–0:50] The flow — create.**
"This is PayLink. A merchant creates an invoice: a payee address, an
amount in tUSD8, a memo, a pay-by deadline. One transaction, and the
invoice exists on-chain — invoice #1, five tUSD8, 'Logo design'. The
buyer opens the same page, no wallet needed just to look: every invoice
is listed straight from the contract's events."

**[0:50–1:30] The flow — pay, three ways.**
"The buyer pays into escrow — the money sits in the contract, not with
the merchant. Three ways to pay: the standard approve-and-pay; a
one-transaction EIP-2612 permit; or gasless — the buyer signs an EIP-3009
authorization off-chain and a relayer, or an AI agent, submits it. The
buyer pays no gas at all, and the signature is bound to that one invoice
id, so it can't be replayed anywhere else. Here invoice #5 was paid
gaslessly by our agent script."

**[1:30–2:10] The flow — release, refund, dispute.**
"Delivery confirmed? The buyer clicks confirm and the escrow releases —
invoice #1, five tUSD8 to the merchant. Buyer goes quiet? After seven
days the merchant claims — invoice #2. Changed your mind? The merchant
refunds in full — invoice #3. Something wrong? The buyer opens a dispute
and the merchant resolves it — refund or release. Invoice #4 was disputed
and refunded. Every step is an on-chain event — a full audit trail on the
Aevum explorer."

**[2:10–2:40] Safety.**
"No admin keys, no upgradeability, no fees taken by the contract. Only
the payer can confirm or dispute; only the payee can claim, refund, or
resolve. Amounts are capped, invoices expire after thirty days, and a
reentrancy guard protects every payout. Testnet only — tUSD8 is play
money, and the faucet gives you 1 tQDAY and 5 tUSD8 to try it."

**[2:40–3:00] Close.**
"PayLink: escrowed invoices in tUSD8 on Aevum. Create an invoice, get
paid when the work is confirmed — not when the client feels like it.
Links: repo, contract address, and live demo are in the submission."

## Re-recording notes

- Use the real Aevum deployment (`?rpc=https://rpc-test.qday.info&
  paylink=0x<DEPLOYED>&from=<DEPLOY_BLOCK>`) so the explorer links in
  the Activity log point at `explorer-test.qday.info`.
- Keep each beat tight; the judges watch for verifiable on-chain activity
  (tx hashes, explorer links, state changes) — show the Activity log and
  click through to at least one transaction on the explorer.
- The silent `web/demo.mp4` can be reused as B-roll under the narration.
