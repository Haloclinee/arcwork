// One-time: registers the ANS name for every judge in agents/judges.mjs that
// doesn't have one yet. Safe to re-run — skips names already owned by their
// wallet. See agents/register-name.mjs for the ANS contract note.
import { makeClients, log, writeAndWait } from "./lib.mjs";
import { ANS_REGISTRY, ansAbi } from "../src/lib/ans.ts";
import { JUDGES } from "./judges.mjs";

for (const j of JUDGES) {
  const pk = process.env[j.pkEnv];
  if (!pk) {
    log("ans", `skipping "${j.key}" — ${j.pkEnv} not set in agents/.env`);
    continue;
  }
  const { account, pub, wallet } = makeClients(pk);

  const available = await pub.readContract({
    address: ANS_REGISTRY,
    abi: ansAbi,
    functionName: "isAvailable",
    args: [j.ansName],
  });
  if (!available) {
    const owner = await pub.readContract({
      address: ANS_REGISTRY,
      abi: ansAbi,
      functionName: "resolve",
      args: [j.ansName],
    });
    if (owner.toLowerCase() === account.address.toLowerCase()) {
      log("ans", `"${j.ansName}" already registered to ${j.key} (${account.address}) — skipping.`);
    } else {
      log("ans", `"${j.ansName}" is taken by ${owner}, not ${j.key}'s wallet (${account.address}) — pick a new name.`);
    }
    continue;
  }

  log("ans", `registering "${j.ansName}" → ${j.key} (${account.address})…`);
  await writeAndWait(pub, wallet, {
    address: ANS_REGISTRY,
    abi: ansAbi,
    functionName: "register",
    args: [j.ansName],
  });
  log("ans", `done — ${account.address} now resolves to "${j.ansName}"`);
}
