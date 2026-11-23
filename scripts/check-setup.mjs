// Check the chain, block height, gas price and an address's balances.
// Usage: node scripts/check-setup.mjs [--rpc <url>] [--address 0x...] [--token 0x...]
// NOTE: do not run this against the real Aevum RPC until RPC access is approved;
// it is safe against a local Hardhat node (http://127.0.0.1:8545).
import { ethers } from "ethers";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const rpc = arg("--rpc", "http://127.0.0.1:8545");
const address = arg("--address", "");
const tokenAddress = arg("--token", "0x456569838f1d43009A91ebA4263147Afd7233483");

const provider = new ethers.JsonRpcProvider(rpc);
const network = await provider.getNetwork();
console.log(`rpc: ${rpc}`);
console.log(`chainId: ${network.chainId}`);
console.log(`block: ${await provider.getBlockNumber()}`);
console.log(`gasPrice: ${await provider.getFeeData().then((f) => f.gasPrice?.toString() ?? "n/a")} wei`);
if (address) {
  console.log(`native balance of ${address}: ${ethers.formatEther(await provider.getBalance(address))}`);
  const token = new ethers.Contract(tokenAddress, ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"], provider);
  try {
    console.log(`token balance: ${ethers.formatUnits(await token.balanceOf(address), 6)} ${await token.symbol()}`);
  } catch (e) {
    console.log(`token read failed: ${e.message}`);
  }
}
