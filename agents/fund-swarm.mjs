// One-time: tops up the 5 client + 5 provider swarm wallets from the
// existing CLIENT_PK / PROVIDER_PK wallets. Clients need real USDC to fund
// job escrow (multiple jobs over time); providers only need gas.
// Run:  node --env-file=agents/.env agents/fund-swarm.mjs
import { parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { makeClients, log } from "./lib.mjs";
import { CLIENT_PERSONAS, PROVIDER_SPECIALTIES } from "./swarm-data.mjs";

const CLIENT_TOPUP = parseEther("3");
const PROVIDER_TOPUP = parseEther("0.6");
const MIN_CLIENT_BALANCE = parseEther("1.5");
const MIN_PROVIDER_BALANCE = parseEther("0.3");

async function topUp(fromPk, targets, topUpAmount, minBalance) {
  const { pub, wallet } = makeClients(fromPk);
  for (const [pk, label] of targets) {
    const address = privateKeyToAccount(pk).address;
    const balance = await pub.getBalance({ address });
    if (balance >= minBalance) {
      log("fund", `"${label}" (${address}) already has ${formatEther(balance)} USDC — skipping`);
      continue;
    }
    log("fund", `topping up "${label}" (${address}) with ${formatEther(topUpAmount)} USDC…`);
    const hash = await wallet.sendTransaction({ to: address, value: topUpAmount });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
    log("fund", `"${label}" funded ✓`);
  }
}

await topUp(
  process.env.CLIENT_PK,
  CLIENT_PERSONAS.map((p, i) => [process.env[`CLIENT_${i + 1}_PK`], p.label]),
  CLIENT_TOPUP,
  MIN_CLIENT_BALANCE,
);
await topUp(
  process.env.PROVIDER_PK,
  PROVIDER_SPECIALTIES.map((p, i) => [process.env[`PROVIDER_${i + 1}_PK`], p.label]),
  PROVIDER_TOPUP,
  MIN_PROVIDER_BALANCE,
);
