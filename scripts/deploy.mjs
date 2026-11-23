// Deploy PayLink to an EVM network (default: Aevum testnet, chain 44005).
// Usage:
//   node scripts/deploy.mjs [--rpc <url>] [--token <tUSD8 address>] [--key <private key>]
// Env: DEPLOYER_KEY, AEVUM_RPC_URL, TUSD8_ADDRESS, PAYLINK_TOKEN
// Writes deployments/<chainId>.json with the address + tx hash.
// The deployer key is a TEST-ONLY wallet. Never commit .env; never share the key.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ethers } from "ethers";
import "dotenv/config";

const TUSD8_AEVUM = "0x456569838f1d43009A91ebA4263147Afd7233483";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const rpc = arg("--rpc", process.env.AEVUM_RPC_URL || "https://rpc-test.qday.info");
const token = arg("--token", process.env.TUSD8_ADDRESS || TUSD8_AEVUM);
const key = arg("--key", process.env.DEPLOYER_KEY);
if (!key) {
  console.error("Missing deployer key. Set DEPLOYER_KEY in .env (test-only wallet) or pass --key.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
console.log(`network: chain ${network.chainId} (${rpc})`);
const wallet = new ethers.Wallet(key, provider);
console.log(`deployer: ${wallet.address}`);
console.log(`balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} native`);

const artifact = JSON.parse(readFileSync(new URL("../artifacts/PayLink.json", import.meta.url), "utf8"));
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
// Aevum sends legacy (type 0) transactions, ~1 gwei gas, like QDay's own tooling.
const overrides = network.chainId === 44005n ? { type: 0, gasPrice: 1_000_000_000n } : {};
const contract = await factory.deploy(token, overrides);
console.log(`deploy tx: ${contract.deploymentTransaction().hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`PayLink deployed at: ${address}`);
console.log(`explorer: https://explorer-test.qday.info/address/${address}`);

mkdirSync(new URL("../deployments", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../deployments/${network.chainId}.json`, import.meta.url),
  JSON.stringify(
    { network: `chain-${network.chainId}`, token, payLink: address, deployer: wallet.address, deployTx: contract.deploymentTransaction().hash, deployedAt: new Date().toISOString() },
    null,
    2
  )
);
console.log(`saved deployments/${network.chainId}.json`);
