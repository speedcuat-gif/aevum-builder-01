// Agent gasless pay: an AI agent (or any relayer) pays a PayLink invoice on behalf
// of a buyer who only signs an EIP-3009 authorization off-chain — the buyer pays no gas.
// Usage:
//   node scripts/agent-pay.mjs --rpc <url> --paylink 0x... --token 0x... --id 3 --amount 1000000 \
//     --buyer-key 0x... --relayer-key 0x... [--token-name tUSD8] [--token-version 2]
// The buyer key never leaves this machine; the signature is made locally and the
// relayer only submits it. Amount is in the token's smallest units (tUSD8: 6 decimals).
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import "dotenv/config";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function required(name) {
  const v = arg(name, "");
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
  return v;
}

const rpc = arg("--rpc", "https://rpc-test.qday.info");
const payLinkAddress = required("--paylink");
const tokenAddress = required("--token");
const id = BigInt(required("--id"));
const amount = BigInt(required("--amount"));
const buyerKey = required("--buyer-key");
const relayerKey = required("--relayer-key");
const tokenName = arg("--token-name", "tUSD8");
const tokenVersion = arg("--token-version", "2");

const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
const buyer = new ethers.Wallet(buyerKey, provider);
const relayer = new ethers.Wallet(relayerKey, provider);
console.log(`network: chain ${network.chainId}`);
console.log(`buyer: ${buyer.address} (signs only, pays no gas)`);
console.log(`relayer/agent: ${relayer.address} (submits, pays gas)`);

const artifact = JSON.parse(readFileSync(new URL("../artifacts/PayLink.json", import.meta.url), "utf8"));
const payLink = new ethers.Contract(payLinkAddress, artifact.abi, provider);
const invoice = await payLink.getInvoice(id);
console.log(`invoice ${id}: amount=${invoice.amount} status=${invoice.status} payee=${invoice.payee}`);
if (invoice.amount !== amount) {
  console.error(`amount mismatch: invoice is ${invoice.amount}, you passed ${amount}`);
  process.exit(1);
}
if (invoice.status !== 0n) {
  console.error(`invoice not open (status ${invoice.status})`);
  process.exit(1);
}

// Buyer signs the EIP-3009 authorization OFF-CHAIN. Nonce is bound to the invoice id.
// Use the CHAIN clock for the validity window (wall clock can lag a time-travelled test chain).
const latestBlock = await provider.getBlock("latest");
const validAfter = 0;
const validBefore = latestBlock.timestamp + 3600;
const nonce = ethers.zeroPadValue(ethers.toBeHex(id), 32);
const domain = { name: tokenName, version: tokenVersion, chainId: network.chainId, verifyingContract: tokenAddress };
const sig = await buyer.signTypedData(
  domain,
  { ReceiveWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  { from: buyer.address, to: payLinkAddress, value: amount, validAfter, validBefore, nonce }
);
const { v, r, s } = ethers.Signature.from(sig);
console.log("buyer signed authorization (off-chain, no gas)");

// Relayer submits it on-chain.
const legacy = network.chainId === 44005n ? { type: 0, gasPrice: 1_000_000_000n } : {};
const tx = await payLink.connect(relayer).payWithAuthorization(id, buyer.address, amount, validAfter, validBefore, v, r, s, legacy);
console.log(`payWithAuthorization tx: ${tx.hash}`);
await tx.wait();
const after = await payLink.getInvoice(id);
console.log(`invoice ${id} status now: ${after.status} (1 = Paid, escrowed)`);
console.log(`explorer: https://explorer-test.qday.info/tx/${tx.hash}`);
