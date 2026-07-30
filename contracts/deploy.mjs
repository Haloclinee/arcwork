// Deploys an arcwork companion contract to Arc Testnet using the client
// agent's wallet (none of these contracts have privileged/owner functions
// post-deploy, so any funded key works).
// Run: node --env-file=agents/.env contracts/deploy.mjs <ContractName>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, ERC8183_ADDRESS } from "../src/lib/arc.ts";

const name = process.argv[2];
if (!name) throw new Error("usage: deploy.mjs <ContractName>  (e.g. JobApplications, JudgeRatings)");

const dir = path.dirname(fileURLToPath(import.meta.url));
const { abi, bytecode } = JSON.parse(readFileSync(path.join(dir, `${name}.json`), "utf8"));

const pk = process.env.CLIENT_PK;
if (!pk) throw new Error("CLIENT_PK not set — run with --env-file=agents/.env");

const account = privateKeyToAccount(pk);
const transport = http("https://rpc.drpc.testnet.arc.network");
const pub = createPublicClient({ chain: arcTestnet, transport });
const wallet = createWalletClient({ account, chain: arcTestnet, transport });

console.log(`Deploying ${name} from`, account.address, "…");
const hash = await wallet.deployContract({ abi, bytecode, args: [ERC8183_ADDRESS] });
console.log("tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error(`Deployment failed: ${JSON.stringify(receipt)}`);
}
console.log(`\n${name} deployed at:`, receipt.contractAddress);
console.log("Explorer:", `https://testnet.arcscan.app/address/${receipt.contractAddress}`);
