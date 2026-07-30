// One-time setup: generates agent wallets (client, provider, one per judge)
// and writes agents/.env.
// Run:  node agents/setup.mjs        (safe to re-run — never overwrites keys)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatEther } from "viem";
import { arcTestnet } from "../src/lib/arc.ts";
import { JUDGES } from "./judges.mjs";

const ENV_PATH = new URL("./.env", import.meta.url);

if (!existsSync(ENV_PATH)) {
  const lines = [
    "# arcwork agent wallets — NEVER commit this file",
    `CLIENT_PK=${generatePrivateKey()}`,
    `PROVIDER_PK=${generatePrivateKey()}`,
    "",
    "# One wallet per judge persona (agents/judges.mjs) — each judges with its own model.",
    ...JUDGES.map((j) => `${j.pkEnv}=${generatePrivateKey()}`),
    "",
    "# Optional: set to use Claude instead of local Ollama for provider/client reasoning",
    "# ANTHROPIC_API_KEY=sk-ant-...",
    "",
  ];
  writeFileSync(ENV_PATH, lines.join("\n"));
  console.log("Generated new agent wallets → agents/.env");
} else {
  // Back-fill anything missing for envs created before the judge roster existed.
  let raw = readFileSync(ENV_PATH, "utf8");
  let changed = false;
  for (const j of JUDGES) {
    if (!raw.includes(`${j.pkEnv}=`)) {
      raw += `${j.pkEnv}=${generatePrivateKey()}\n`;
      changed = true;
    }
  }
  // OLLAMA_MODEL is no longer used (each judge carries its own model in judges.mjs)
  // but leave any existing line alone — harmless.
  if (changed) {
    writeFileSync(ENV_PATH, raw);
    console.log("agents/.env existed — added missing judge wallet(s).");
  } else {
    console.log("agents/.env already exists — keeping existing keys.");
  }
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=", 2)),
);

const clientAddr = privateKeyToAccount(env.CLIENT_PK).address;
const providerAddr = privateKeyToAccount(env.PROVIDER_PK).address;
const judgeAddrs = JUDGES.map((j) => ({ ...j, address: privateKeyToAccount(env[j.pkEnv]).address }));

const pub = createPublicClient({ chain: arcTestnet, transport: http() });
const [cBal, pBal, ...jBals] = await Promise.all([
  pub.getBalance({ address: clientAddr }),
  pub.getBalance({ address: providerAddr }),
  ...judgeAddrs.map((j) => pub.getBalance({ address: j.address })),
]);

console.log("\n  Client agent   :", clientAddr, `(${formatEther(cBal)} USDC)`);
console.log("  Provider agent :", providerAddr, `(${formatEther(pBal)} USDC)`);
judgeAddrs.forEach((j, i) => {
  console.log(`  Judge "${j.key}" (${j.model}):`, j.address, `(${formatEther(jBals[i])} USDC)`);
});

const models = [...new Set(JUDGES.map((j) => j.model))];
console.log(`
Fund every address above with Arc Testnet USDC (gas + budget):
  - https://faucet.circle.com  → pick "Arc Testnet", paste each address
  - or send from MetaMask

The CLIENT needs ~2 USDC (funds job budgets); everyone else needs ~0.5 USDC
each for gas — judges never touch the escrow itself.

Judges evaluate with LOCAL models via Ollama — never a cloud API. Pull them all:
${models.map((m) => `  ollama pull ${m}`).join("\n")}

New judge personas: run agents/register-judges.mjs once to claim their ANS names.

Then run each in its own terminal:
  node --env-file=agents/.env agents/evaluator.mjs   # runs ALL judges concurrently
  node --env-file=agents/.env agents/provider.mjs
  node --env-file=agents/.env agents/client.mjs`);
