// Compile contracts with solc-js, EVM version Shanghai (Aevum has no Cancun opcodes).
// Usage: node scripts/compile.mjs
// Output: artifacts/PayLink.json, artifacts/MockUSD8.json (abi + bytecode).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import solc from "solc";

const sources = {
  "PayLink.sol": readFileSync(new URL("../contracts/PayLink.sol", import.meta.url), "utf8"),
  "MockUSD8.sol": readFileSync(new URL("../contracts/MockUSD8.sol", import.meta.url), "utf8"),
};

const input = {
  language: "Solidity",
  sources: Object.fromEntries(Object.entries(sources).map(([name, content]) => [name, { content }])),
  settings: {
    evmVersion: "shanghai",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
for (const e of output.errors || []) {
  console.log(`${e.severity}: ${e.formattedMessage}`);
}
if (errors.length > 0) process.exit(1);

mkdirSync(new URL("../artifacts", import.meta.url), { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const out = {
      contractName: name,
      sourceName: file,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
    writeFileSync(new URL(`../artifacts/${name}.json`, import.meta.url), JSON.stringify(out, null, 2));
    console.log(`wrote artifacts/${name}.json (${c.evm.bytecode.object.length / 2} bytes)`);
  }
}
