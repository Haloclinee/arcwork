// One-time (per wallet): registers an XMTP inbox for the client/provider
// agent wallets so they're reachable via arcwork's chat feature (see
// src/lib/xmtp.ts). XMTP requires a wallet to have created its own inbox
// before anyone can DM it — real users get this for free when they create a
// job or apply through the site (both flows silently call getXmtpClient),
// but agent wallets driven by scripts skip the browser entirely, so they
// need this run once. Safe to re-run — Client.create() is idempotent for an
// already-registered address.
import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { hexToBytes } from "viem";
import { log } from "./lib.mjs";

async function register(pkEnv) {
  const pk = process.env[pkEnv];
  if (!pk) {
    log("xmtp", `skipping ${pkEnv} — not set in agents/.env`);
    return;
  }
  const account = privateKeyToAccount(pk);
  const signer = {
    type: "EOA",
    getIdentifier: () => ({ identifier: account.address.toLowerCase(), identifierKind: IdentifierKind.Ethereum }),
    signMessage: async (message) => hexToBytes(await account.signMessage({ message })),
  };
  const client = await Client.create(signer, { env: "dev" });
  log("xmtp", `${pkEnv} (${account.address}) — inboxId ${client.inboxId}`);
}

for (const pkEnv of ["CLIENT_PK", "PROVIDER_PK"]) {
  await register(pkEnv);
}
