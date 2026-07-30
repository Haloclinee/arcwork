// Compiles every arcwork contract in this folder with solc-js and writes a
// <Name>.json artifact (abi + bytecode) per contract.
// Run: node contracts/compile.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import solc from "solc";

const CONTRACTS = ["JobApplications", "JudgeRatings", "JudgeTips", "JudgeFee"];
const dir = path.dirname(fileURLToPath(import.meta.url));

for (const name of CONTRACTS) {
  const file = `${name}.sol`;
  const source = readFileSync(path.join(dir, file), "utf8");

  const input = {
    language: "Solidity",
    sources: { [file]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    for (const e of output.errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  for (const e of output.errors ?? []) console.warn(e.formattedMessage); // warnings only

  const contract = output.contracts[file][name];
  const artifact = {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(artifact, null, 2));
  console.log(`Compiled OK — ${name}: ${(artifact.bytecode.length - 2) / 2} bytes → contracts/${name}.json`);
}
