// One-time: registers a human-readable ANS (arcnames.xyz) name for the
// evaluator agent's wallet, so arcwork can display "arcwork-judge" instead
// of a raw 0x address wherever that wallet appears.
//
// ANS is a small, independent community contract on Arc Testnet — verified
// on-chain against https://github.com/Alicepoltora/arc-name-service before
// use. register() is gas-only (no fee, no admin, no upgradeability).
//
// Run:  node --env-file=agents/.env agents/register-name.mjs [name] [PK_ENV_VAR]
import { makeClients, log, writeAndWait } from "./lib.mjs";
import { ANS_REGISTRY, ansAbi } from "../src/lib/ans.ts";

const name = process.argv[2] ?? "arcwork-judge";
const pkVar = process.argv[3] ?? "EVALUATOR_PK";
const pk = process.env[pkVar];
if (!pk) throw new Error(`${pkVar} not set in agents/.env`);

const { account, pub, wallet } = makeClients(pk);

const available = await pub.readContract({
  address: ANS_REGISTRY,
  abi: ansAbi,
  functionName: "isAvailable",
  args: [name],
});
if (!available) {
  const owner = await pub.readContract({ address: ANS_REGISTRY, abi: ansAbi, functionName: "resolve", args: [name] });
  if (owner.toLowerCase() === account.address.toLowerCase()) {
    log("ans", `"${name}" is already registered to this wallet (${account.address}) — nothing to do.`);
  } else {
    log("ans", `"${name}" is taken by ${owner} — pick a different name.`);
  }
  process.exit(0);
}

log("ans", `registering "${name}" → ${account.address}…`);
await writeAndWait(pub, wallet, {
  address: ANS_REGISTRY,
  abi: ansAbi,
  functionName: "register",
  args: [name],
});
log("ans", `done — ${account.address} now resolves to "${name}" on arcwork and any ANS-aware app.`);
