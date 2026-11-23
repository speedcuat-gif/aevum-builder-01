// PayLink web UI — static page, no build step.
// Reads the chain through a public RPC (no wallet needed to browse invoices);
// writes need a wallet (MetaMask or any injected provider).
// URL params: ?rpc=…&paylink=0x…&token=0x…&from=<deploy block>
import { ethers } from "ethers";

const TUSD8_AEVUM = "0x456569838f1d43009A91ebA4263147Afd7233483";
const EXPLORER = "https://explorer-test.qday.info";
const AEVUM_CHAIN_ID = 44005;
const CHUNK = 1000; // Aevum eth_getLogs limit is 1,000 blocks

const params = new URLSearchParams(location.search);
const RPC_URL = params.get("rpc") || "https://rpc-test.qday.info";
// TODO (after the real testnet deploy): paste the deployed PayLink address here.
const PAYLINK_DEFAULT = "0x0000000000000000000000000000000000000000";
const PAYLINK = params.get("paylink") || PAYLINK_DEFAULT;
const TOKEN = params.get("token") || TUSD8_AEVUM;
const DEPLOY_BLOCK = params.get("from") ? Number(params.get("from")) : null;

const PAYLINK_ABI = [
  "function createInvoice(address payee, uint256 amount, string memo, uint64 expiry) returns (uint256)",
  "function payInvoice(uint256 id)",
  "function payWithPermit(uint256 id, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function confirmDelivery(uint256 id)",
  "function claimAfterTimeout(uint256 id)",
  "function refundInvoice(uint256 id)",
  "function openDispute(uint256 id)",
  "function resolveDispute(uint256 id, bool refundBuyer)",
  "function cancelInvoice(uint256 id)",
  "function getInvoice(uint256 id) view returns (tuple(address payee, address payer, uint256 amount, uint64 expiry, uint64 paidAt, uint8 status, string memo))",
  "function invoiceCount() view returns (uint256)",
  "function token() view returns (address)",
  "event InvoiceCreated(uint256 indexed id, address indexed payee, uint256 amount, uint64 expiry, string memo)",
];
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function nonces(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const STATUS = ["Created", "Paid", "Disputed", "Released", "Refunded", "Cancelled"];

const $ = (id) => document.getElementById(id);
const logEl = $("log");
function log(msg, txHash) {
  const div = document.createElement("div");
  div.innerHTML = txHash
    ? `${msg} — <a href="${EXPLORER}/tx/${txHash}" target="_blank" rel="noopener">${txHash.slice(0, 18)}…</a>`
    : msg;
  logEl.prepend(div);
}
function short(addr) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—"; }
function fmt(v) { return ethers.formatUnits(v, 6); }

const readProvider = new ethers.JsonRpcProvider(RPC_URL);
const payLinkRead = new ethers.Contract(PAYLINK, PAYLINK_ABI, readProvider);
const tokenRead = new ethers.Contract(TOKEN, TOKEN_ABI, readProvider);
let signer = null;
let account = null;

async function refreshBalances() {
  if (!account) return;
  $("balNative").textContent = `${Number(ethers.formatEther(await readProvider.getBalance(account))).toFixed(4)} tQDAY`;
  $("balToken").textContent = `${fmt(await tokenRead.balanceOf(account))} tUSD8`;
}

async function connect() {
  if (!window.ethereum) { alert("No wallet found. Install MetaMask (or another EVM wallet) to transact."); return; }
  const provider = new ethers.BrowserProvider(window.ethereum);
  try {
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (net.chainId !== BigInt(AEVUM_CHAIN_ID) && !params.get("rpc")) {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ethers.toBeHex(AEVUM_CHAIN_ID) }] });
      } catch {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: ethers.toBeHex(AEVUM_CHAIN_ID), chainName: "Aevum Testnet", nativeCurrency: { name: "tQDAY", symbol: "tQDAY", decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER] }],
        });
      }
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    $("net").textContent = `connected: ${short(account)}`;
    $("connectBtn").textContent = "Connected";
    $("payee").value = account;
    await refreshBalances();
    log(`connected ${account}`);
  } catch (e) {
    log(`connect failed: ${e.shortMessage || e.message}`);
  }
}

function txOverrides() { return {}; } // Aevum accepts default (legacy) style from wallets

async function send(txPromise, label) {
  try {
    const tx = await txPromise;
    log(`${label} sent`, tx.hash);
    const receipt = await tx.wait();
    log(`${label} confirmed in block ${receipt.blockNumber}`, tx.hash);
    await refreshBalances();
    return receipt;
  } catch (e) {
    log(`${label} failed: ${e.shortMessage || e.message}`);
    throw e;
  }
}

function payLinkWrite() {
  if (!signer) { alert("Connect your wallet first."); throw new Error("no signer"); }
  return new ethers.Contract(PAYLINK, PAYLINK_ABI, signer);
}
function tokenWrite() {
  if (!signer) { alert("Connect your wallet first."); throw new Error("no signer"); }
  return new ethers.Contract(TOKEN, TOKEN_ABI, signer);
}

function invoiceCard(inv, id) {
  const div = document.createElement("div");
  div.className = "invoice";
  const st = STATUS[inv.status];
  const isPayer = account && inv.payer.toLowerCase() === account.toLowerCase();
  const isPayee = account && inv.payee.toLowerCase() === account.toLowerCase();
  const paidAt = inv.paidAt ? new Date(Number(inv.paidAt) * 1000).toLocaleString() : "—";
  const confirmBy = inv.paidAt ? new Date((Number(inv.paidAt) + 7 * 86400) * 1000).toLocaleString() : "—";
  div.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <b>Invoice #${id}</b><span class="badge b-${st.toLowerCase()}">${st}</span>
      <span class="mono">${fmt(inv.amount)} tUSD8</span>
    </div>
    <p class="muted">${inv.memo || "(no memo)"}<br>
    payee <span class="mono">${short(inv.payee)}</span> · payer <span class="mono">${short(inv.payer)}</span><br>
    pay by ${new Date(Number(inv.expiry) * 1000).toLocaleString()} · paid ${paidAt} · confirm by ${confirmBy}</p>
    <div class="row" data-actions></div>`;
  const actions = div.querySelector("[data-actions]");
  const btn = (label, primary, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = fn;
    actions.appendChild(b);
  };
  if (inv.status === 0) {
    btn("Pay (approve + pay)", true, async () => {
      const t = tokenWrite();
      await send(t.approve(PAYLINK, inv.amount), `approve ${fmt(inv.amount)} tUSD8`);
      await send(payLinkWrite().payInvoice(id), `pay invoice #${id}`);
      await loadInvoice(id);
    });
    btn("Pay with permit (1 tx)", false, async () => {
      const p = payLinkWrite();
      const tokenC = tokenWrite();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await tokenRead.nonces(account);
      const name = await tokenRead.name();
      const version = TOKEN === TUSD8_AEVUM ? "2" : "1";
      const net = await readProvider.getNetwork();
      const sig = await signer.signTypedData(
        { name, version, chainId: net.chainId, verifyingContract: TOKEN },
        { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
        { owner: account, spender: PAYLINK, value: inv.amount, nonce, deadline }
      );
      const { v, r, s } = ethers.Signature.from(sig);
      await send(p.payWithPermit(id, inv.amount, deadline, v, r, s), `permit-pay invoice #${id}`);
      await loadInvoice(id);
    });
    if (isPayee) btn("Cancel", false, async () => { await send(payLinkWrite().cancelInvoice(id), `cancel invoice #${id}`); await loadInvoice(id); });
  }
  if (inv.status === 1) {
    if (isPayer) {
      btn("Confirm delivery (release)", true, async () => { await send(payLinkWrite().confirmDelivery(id), `confirm invoice #${id}`); await loadInvoice(id); });
      btn("Open dispute", false, async () => { await send(payLinkWrite().openDispute(id), `dispute invoice #${id}`); await loadInvoice(id); });
    }
    if (isPayee) {
      btn("Claim after timeout", false, async () => { await send(payLinkWrite().claimAfterTimeout(id), `claim invoice #${id}`); await loadInvoice(id); });
      btn("Refund", false, async () => { await send(payLinkWrite().refundInvoice(id), `refund invoice #${id}`); await loadInvoice(id); });
    }
  }
  if (inv.status === 2 && isPayee) {
    btn("Resolve: refund buyer", false, async () => { await send(payLinkWrite().resolveDispute(id, true), `resolve invoice #${id} (refund)`); await loadInvoice(id); });
    btn("Resolve: release to me", true, async () => { await send(payLinkWrite().resolveDispute(id, false), `resolve invoice #${id} (release)`); await loadInvoice(id); });
  }
  return div;
}

async function loadInvoice(id) {
  const box = $("invoices");
  try {
    const inv = await payLinkRead.getInvoice(id);
    if (inv.payee === ethers.ZeroAddress) { box.innerHTML = `<p class="muted">Invoice #${id} does not exist.</p>`; return; }
    box.innerHTML = "";
    box.appendChild(invoiceCard(inv, id));
  } catch (e) {
    box.innerHTML = `<p class="muted">Could not load invoice #${id}: ${e.shortMessage || e.message}</p>`;
  }
}

async function listInvoices() {
  const box = $("invoices");
  $("listStatus").textContent = "Reading events…";
  try {
    const latest = await readProvider.getBlockNumber();
    let from = DEPLOY_BLOCK ?? Math.max(0, latest - 50000);
    const ids = [];
    for (let start = from; start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      const logs = await payLinkRead.queryFilter(payLinkRead.filters.InvoiceCreated, start, end);
      for (const l of logs) ids.push(Number(l.args.id));
      $("listStatus").textContent = `Scanned blocks ${from}–${end}… (${ids.length} invoices)`;
    }
    ids.sort((a, b) => b - a);
    box.innerHTML = ids.length ? "" : "<p class='muted'>No invoices found.</p>";
    for (const id of ids) box.appendChild(invoiceCard(await payLinkRead.getInvoice(id), id));
    $("listStatus").textContent = `${ids.length} invoice(s) loaded.`;
  } catch (e) {
    $("listStatus").textContent = `List failed: ${e.shortMessage || e.message}`;
  }
}

$("connectBtn").onclick = connect;
$("createBtn").onclick = async () => {
  const payee = $("payee").value.trim();
  const amount = $("amount").value.trim();
  const memo = $("memo").value.trim();
  const days = Number($("expiryDays").value || "7");
  if (!ethers.isAddress(payee)) { $("createStatus").textContent = "Payee is not a valid address."; return; }
  if (!amount || Number(amount) <= 0) { $("createStatus").textContent = "Enter an amount greater than 0."; return; }
  const value = ethers.parseUnits(amount, 6);
  const expiry = Math.floor(Date.now() / 1000) + days * 86400;
  $("createStatus").textContent = "Sending…";
  try {
    const receipt = await send(payLinkWrite().createInvoice(payee, value, memo, expiry), "create invoice");
    const count = await payLinkRead.invoiceCount();
    $("createStatus").textContent = `Invoice #${count} created. Share the ID with your buyer.`;
    await loadInvoice(count);
  } catch { $("createStatus").textContent = "Create failed — see Activity."; }
};
$("lookupBtn").onclick = () => loadInvoice(BigInt($("lookupId").value || "1"));
$("listBtn").onclick = listInvoices;

$("contractAddr").textContent = PAYLINK === PAYLINK_DEFAULT ? "not deployed yet — set ?paylink=0x…" : short(PAYLINK);
tokenRead.name().then((n) => { $("tokenAddr").textContent = `${n} ${short(TOKEN)}`; }).catch(() => { $("tokenAddr").textContent = short(TOKEN); });
if (PAYLINK === PAYLINK_DEFAULT) log("PayLink address not set yet: pass ?paylink=0x… or deploy first (see README).");
log(`reading Aevum testnet (${RPC_URL}) — no wallet needed to browse`);
listInvoices();
