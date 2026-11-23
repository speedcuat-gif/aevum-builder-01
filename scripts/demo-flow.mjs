// End-to-end demo of PayLink on a local chain or Aevum testnet.
// Flow: merchant creates invoice -> buyer pays (3 ways: approve+pay, permit,
// EIP-3009 gasless via relayer) -> buyer confirms / merchant claims / refund.
// Usage:
//   node scripts/demo-flow.mjs --rpc http://127.0.0.1:8545 --local   (deploys MockUSD8 + PayLink fresh)
//   node scripts/demo-flow.mjs --rpc https://rpc-test.qday.info --paylink 0x... --token 0x...
// Env: MERCHANT_KEY, BUYER_KEY, RELAYER_KEY (test-only wallets; defaults to Hardhat #0/#1/#2).
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import "dotenv/config";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(name);

const rpc = arg("--rpc", "http://127.0.0.1:8545");
const local = has("--local");
const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
console.log(`network: chain ${network.chainId} (${rpc})`);

const MNEMONIC = "test test test test test test test test test test test junk"; // Hardhat local only
// NB: Wallet.fromPhrase(mnemonic, path) ignores the path in ethers v6 — derive
// from the seed instead, or every "account" is #0 and nonces collide.
const HD_ROOT = ethers.HDNodeWallet.fromSeed(ethers.Mnemonic.fromPhrase(MNEMONIC).computeSeed());
function localWallet(i) {
  return new ethers.Wallet(HD_ROOT.derivePath(`m/44'/60'/0'/0/${i}`).privateKey, provider);
}
// Plain wallets for addresses + offline signing; NonceManager-wrapped copies for
// sending (ethers v6 can otherwise reuse a stale nonce across back-to-back sends).
const merchantW = process.env.MERCHANT_KEY ? new ethers.Wallet(process.env.MERCHANT_KEY, provider) : localWallet(0);
const buyerW = process.env.BUYER_KEY ? new ethers.Wallet(process.env.BUYER_KEY, provider) : localWallet(1);
const relayerW = process.env.RELAYER_KEY ? new ethers.Wallet(process.env.RELAYER_KEY, provider) : localWallet(2);
const merchant = new ethers.NonceManager(merchantW);
const buyer = new ethers.NonceManager(buyerW);
const relayer = new ethers.NonceManager(relayerW);
const tokenName = arg("--token-name", local ? "MockUSD8" : "tUSD8");
const tokenVersion = arg("--token-version", local ? "1" : "2");

const payLinkArtifact = JSON.parse(readFileSync(new URL("../artifacts/PayLink.json", import.meta.url), "utf8"));
const mockArtifact = JSON.parse(readFileSync(new URL("../artifacts/MockUSD8.json", import.meta.url), "utf8"));
const legacy = network.chainId === 44005n ? { type: 0, gasPrice: 1_000_000_000n } : {};

let tokenAddress = arg("--token", "");
let payLinkAddress = arg("--paylink", "");

if (local) {
  console.log("deploying MockUSD8...");
  const mockFactory = new ethers.ContractFactory(mockArtifact.abi, mockArtifact.bytecode, merchant);
  const mock = await mockFactory.deploy();
  await mock.waitForDeployment();
  tokenAddress = await mock.getAddress();
  console.log(`MockUSD8 at ${tokenAddress}`);
  const mintTx = await mock.mint(buyerW.address, 10_000_000_000n); // 10,000 tUSD8 (6 dec)
  await mintTx.wait();
  console.log(`minted 10,000 tUSD8 to buyer ${buyerW.address} (tx ${mintTx.hash})`);
}

if (!payLinkAddress) {
  console.log("deploying PayLink...");
  const factory = new ethers.ContractFactory(payLinkArtifact.abi, payLinkArtifact.bytecode, merchant);
  const c = await factory.deploy(tokenAddress, legacy);
  await c.waitForDeployment();
  payLinkAddress = await c.getAddress();
  console.log(`PayLink at ${payLinkAddress}`);
}

const token = new ethers.Contract(tokenAddress, mockArtifact.abi, provider);
const payLink = new ethers.Contract(payLinkAddress, payLinkArtifact.abi, provider);
const fmt = (v) => `${ethers.formatUnits(v, 6)} tUSD8`;
// Chain clock, not wall clock: the local chain is time-travelled in flow 2,
// so wall-clock deadlines would land in the past.
async function chainNow() { return (await provider.getBlock("latest")).timestamp; }

async function showInvoice(id, label) {
  const inv = await payLink.getInvoice(id);
  const names = ["Created", "Paid", "Disputed", "Released", "Refunded", "Cancelled"];
  console.log(`  [${label}] id=${id} status=${names[inv.status]} amount=${fmt(inv.amount)} payee=${inv.payee} payer=${inv.payer} memo="${inv.memo}"`);
}

// --- 1. approve + pay, then confirm ---------------------------------------
console.log("\n== flow 1: approve + pay, buyer confirms ==");
let tx = await payLink.connect(merchant).createInvoice(merchantW.address, 5_000_000n, "Logo design — invoice #1", (await chainNow()) + 86400);
let receipt = await tx.wait();
let id = 1n;
console.log(`  createInvoice tx ${tx.hash}`);
tx = await token.connect(buyer).approve(payLinkAddress, 5_000_000n);
await tx.wait();
console.log(`  approve tx ${tx.hash}`);
tx = await payLink.connect(buyer).payInvoice(id, legacy);
await tx.wait();
console.log(`  payInvoice tx ${tx.hash}`);
await showInvoice(id, "paid");
tx = await payLink.connect(buyer).confirmDelivery(id, legacy);
await tx.wait();
console.log(`  confirmDelivery tx ${tx.hash}`);
await showInvoice(id, "released");
console.log(`  merchant balance: ${fmt(await token.balanceOf(merchantW.address))}`);

// --- 2. permit + pay, then merchant claims after timeout -------------------
console.log("\n== flow 2: EIP-2612 permit + pay, merchant claims after timeout ==");
tx = await payLink.connect(merchant).createInvoice(merchantW.address, 2_500_000n, "Monthly retainer — invoice #2", (await chainNow()) + 86400);
await tx.wait();
id = 2n;
const deadline = (await chainNow()) + 3600;
const nonce = await token.nonces(buyerW.address);
const domain = { name: tokenName, version: tokenVersion, chainId: network.chainId, verifyingContract: tokenAddress };
const permitSig = await buyerW.signTypedData(
  domain,
  { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
  { owner: buyerW.address, spender: payLinkAddress, value: 2_500_000n, nonce, deadline }
);
const { v, r, s } = ethers.Signature.from(permitSig);
tx = await payLink.connect(buyer).payWithPermit(id, 2_500_000n, deadline, v, r, s, legacy);
await tx.wait();
console.log(`  payWithPermit tx ${tx.hash}`);
await showInvoice(id, "paid");
// fast-forward 7 days + 1s on a local chain so the merchant can claim
if (local) {
  await provider.send("evm_increaseTime", [7 * 86400 + 1]);
  await provider.send("evm_mine", []);
}
tx = await payLink.connect(merchant).claimAfterTimeout(id, legacy);
await tx.wait();
console.log(`  claimAfterTimeout tx ${tx.hash}`);
await showInvoice(id, "released");

// --- 3. gasless EIP-3009 pay via relayer, then refund -----------------------
console.log("\n== flow 3: EIP-3009 gasless pay (agent/relayer submits), merchant refunds ==");
tx = await payLink.connect(merchant).createInvoice(merchantW.address, 1_000_000n, "Bug bounty payout — invoice #3", (await chainNow()) + 86400);
await tx.wait();
id = 3n;
const validAfter = 0;
const validBefore = (await chainNow()) + 3600;
const authNonce = ethers.zeroPadValue(ethers.toBeHex(id), 32); // must equal bytes32(invoice id)
const authSig = await buyerW.signTypedData(
  domain,
  { ReceiveWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  { from: buyerW.address, to: payLinkAddress, value: 1_000_000n, validAfter, validBefore, nonce: authNonce }
);
const a = ethers.Signature.from(authSig);
tx = await payLink.connect(relayer).payWithAuthorization(id, buyerW.address, 1_000_000n, validAfter, validBefore, a.v, a.r, a.s, legacy);
await tx.wait();
console.log(`  payWithAuthorization tx ${tx.hash} (submitted by relayer ${relayerW.address}, buyer paid no gas)`);
await showInvoice(id, "paid");
tx = await payLink.connect(merchant).refundInvoice(id, legacy);
await tx.wait();
console.log(`  refundInvoice tx ${tx.hash}`);
await showInvoice(id, "refunded");
console.log(`  buyer balance: ${fmt(await token.balanceOf(buyerW.address))}`);

// --- 4. dispute: buyer disputes, merchant resolves with a refund -----------
console.log("\n== flow 4: dispute, merchant resolves (refund) ==");
tx = await payLink.connect(merchant).createInvoice(merchantW.address, 750_000n, "Consulting call — invoice #4", (await chainNow()) + 86400);
await tx.wait();
id = 4n;
tx = await token.connect(buyer).approve(payLinkAddress, 750_000n);
await tx.wait();
tx = await payLink.connect(buyer).payInvoice(id, legacy);
await tx.wait();
console.log(`  payInvoice tx ${tx.hash}`);
await showInvoice(id, "paid");
tx = await payLink.connect(buyer).openDispute(id, legacy);
await tx.wait();
console.log(`  openDispute tx ${tx.hash}`);
await showInvoice(id, "disputed");
tx = await payLink.connect(merchant).resolveDispute(id, true, legacy);
await tx.wait();
console.log(`  resolveDispute(refund) tx ${tx.hash}`);
await showInvoice(id, "refunded");
console.log(`  buyer balance: ${fmt(await token.balanceOf(buyerW.address))}`);

console.log(`\nDONE. PayLink: ${payLinkAddress} | token: ${tokenAddress}`);
console.log(`explorer: https://explorer-test.qday.info/address/${payLinkAddress}`);
