// One-time: registers every judge in agents/judges.mjs as an ERC-8004 agent
// identity on Arc's IdentityRegistry (see src/lib/erc8004.ts for the address/
// ABI note). Safe to re-run — skips judges whose wallet already owns a token
// (checked by scanning Transfer events, since the registry has no
// "already registered" getter). Prints the minted agentId for each judge so
// it can be copied into src/lib/presets.ts.
import { makeClients, log, writeAndWait } from "./lib.mjs";
import { ERC8004_IDENTITY_ADDRESS, erc8004IdentityAbi } from "../src/lib/erc8004.ts";
import { JUDGES } from "./judges.mjs";

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
  ],
};

for (const j of JUDGES) {
  const pk = process.env[j.pkEnv];
  if (!pk) {
    log("erc8004", `skipping "${j.key}" — ${j.pkEnv} not set in agents/.env`);
    continue;
  }
  const { account, pub, wallet } = makeClients(pk);

  // Public RPCs only keep ~10k blocks of history — fine here since these
  // registries were only just discovered/used this session.
  const latest = await pub.getBlockNumber();
  const existing = await pub.getLogs({
    address: ERC8004_IDENTITY_ADDRESS,
    event: transferEvent,
    args: { from: "0x0000000000000000000000000000000000000000", to: account.address },
    fromBlock: latest - 9_500n,
    toBlock: latest,
  });
  if (existing.length > 0) {
    log(
      "erc8004",
      `"${j.key}" (${account.address}) already registered — agentId ${existing[0].args.tokenId}`,
    );
    continue;
  }

  const metadata = {
    name: j.ansName,
    description: j.description,
    model: j.model,
    role: "arcwork-judge",
  };
  const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;

  log("erc8004", `registering "${j.key}" (${account.address})…`);
  const receipt = await writeAndWait(pub, wallet, {
    address: ERC8004_IDENTITY_ADDRESS,
    abi: erc8004IdentityAbi,
    functionName: "register",
    args: [metadataURI],
  });
  // Decode the Transfer log directly from the receipt to get the agentId.
  const { decodeEventLog } = await import("viem");
  let agentId = null;
  for (const l of receipt.logs) {
    if (l.address.toLowerCase() !== ERC8004_IDENTITY_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: [transferEvent], data: l.data, topics: l.topics });
      if (decoded.eventName === "Transfer") {
        agentId = decoded.args.tokenId;
        break;
      }
    } catch {
      // not a Transfer log, skip
    }
  }
  log("erc8004", `done — "${j.key}" is agentId ${agentId} (tx ${receipt.transactionHash})`);
}
