// One-time: generates 5 client + 5 provider wallets for the agent swarm
// (agents/client-agent.mjs, agents/provider-agent.mjs) and appends them to
// agents/.env. Safe to re-run — never overwrites existing keys.
// Run:  node agents/setup-swarm.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { arcTestnet } from "./chain.mjs";
import { CLIENT_PERSONAS, PROVIDER_SPECIALTIES } from "./swarm-data.mjs";

const ENV_PATH = new URL("./.env", import.meta.url);

const clientKeys = CLIENT_PERSONAS.map((_, i) => `CLIENT_${i + 1}_PK`);
const providerKeys = PROVIDER_SPECIALTIES.map((_, i) => `PROVIDER_${i + 1}_PK`);
const allKeys = [...clientKeys, ...providerKeys];

if (!existsSync(ENV_PATH)) {
  throw new Error("agents/.env doesn't exist — run agents/setup.mjs first.");
}

let raw = readFileSync(ENV_PATH, "utf8");
let changed = false;
for (const k of allKeys) {
  if (!raw.includes(`${k}=`)) {
    raw += `${k}=${generatePrivateKey()}\n`;
    changed = true;
  }
}
if (changed) {
  writeFileSync(ENV_PATH, raw);
  console.log("Added missing swarm wallet(s) to agents/.env");
} else {
  console.log("agents/.env already has all swarm wallets — keeping existing keys.");
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=", 2)),
);

const pub = createPublicClient({ chain: arcTestnet, transport: http() });

console.log("\nClient agents:");
for (const [i, p] of CLIENT_PERSONAS.entries()) {
  const addr = privateKeyToAccount(env[`CLIENT_${i + 1}_PK`]).address;
  const bal = await pub.getBalance({ address: addr });
  console.log(`  ${p.label.padEnd(16)} ${addr}  (${formatEther(bal)} USDC)`);
}
console.log("\nProvider agents:");
for (const [i, p] of PROVIDER_SPECIALTIES.entries()) {
  const addr = privateKeyToAccount(env[`PROVIDER_${i + 1}_PK`]).address;
  const bal = await pub.getBalance({ address: addr });
  console.log(`  ${p.label.padEnd(20)} ${addr}  (${formatEther(bal)} USDC)`);
}

console.log(`
Next: node --env-file=agents/.env agents/fund-swarm.mjs
  (tops up every wallet above from CLIENT_PK / PROVIDER_PK)`);
