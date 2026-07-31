// One-time: tops up any judge wallet (agents/judges.mjs) under a balance
// threshold from the CLIENT wallet — used to spread testnet USDC out to the
// new judge personas without funding each address by hand via the faucet.
// Run:  node --env-file=agents/.env agents/fund-judges.mjs
import { parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { makeClients, log } from "./lib.mjs";
import { JUDGES } from "./judges.mjs";

const TOP_UP = parseEther("0.6");
const MIN_BALANCE = parseEther("0.3");

const { pub, wallet } = makeClients(process.env.CLIENT_PK);

for (const j of JUDGES) {
  const pk = process.env[j.pkEnv];
  if (!pk) {
    log("fund", `skipping "${j.key}" — ${j.pkEnv} not set`);
    continue;
  }
  const address = privateKeyToAccount(pk).address;
  const balance = await pub.getBalance({ address });
  if (balance >= MIN_BALANCE) {
    log("fund", `"${j.key}" (${address}) already has ${formatEther(balance)} USDC — skipping`);
    continue;
  }
  log("fund", `topping up "${j.key}" (${address}) with ${formatEther(TOP_UP)} USDC…`);
  const hash = await wallet.sendTransaction({ to: address, value: TOP_UP });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  log("fund", `"${j.key}" funded ✓`);
}
