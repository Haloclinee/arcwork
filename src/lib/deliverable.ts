import { decodeFunctionData, hexToString, keccak256, type PublicClient } from "viem";
import { ERC8183_ADDRESS, erc8183Abi } from "./arc";

import { jobSubmittedEvent } from "./events";

const CHUNK = 9_500n; // public RPCs cap eth_getLogs at 10k blocks
const MAX_CHUNKS = 30;

export interface DeliverableProof {
  hash: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
  /** Deliverable content recovered from the submit tx calldata, present only
   *  when its keccak256 matches the on-chain hash. */
  content: string | null;
}

// Walk backwards from the latest block until this job's JobSubmitted event is
// found. Bounded: gives up after ~285k blocks (public RPC scan limit).
export async function findDeliverable(
  client: PublicClient,
  jobId: bigint,
): Promise<DeliverableProof | "not-found" | "out-of-range"> {
  const latest = await client.getBlockNumber();
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const toBlock = latest - CHUNK * BigInt(i);
    if (toBlock < 1n) return "not-found";
    let fromBlock = toBlock - CHUNK + 1n;
    if (fromBlock < 1n) fromBlock = 1n;
    const logs = await client.getLogs({
      address: ERC8183_ADDRESS,
      event: jobSubmittedEvent,
      args: { jobId },
      fromBlock,
      toBlock,
    });
    if (logs.length > 0) {
      const log = logs[logs.length - 1];
      return {
        hash: log.args.deliverable!,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        content: await recoverContent(client, log.transactionHash, log.args.deliverable!),
      };
    }
  }
  return "out-of-range";
}

// arcwork embeds the deliverable text into submit()'s optParams calldata, so the
// content lives on-chain in the tx itself. Recover it and accept it only when
// keccak256(optParams) equals the committed hash — otherwise optParams is
// something else (another client's hook data) and we fall back to hash-only.
async function recoverContent(
  client: PublicClient,
  txHash: `0x${string}`,
  committedHash: `0x${string}`,
): Promise<string | null> {
  try {
    const tx = await client.getTransaction({ hash: txHash });
    const decoded = decodeFunctionData({ abi: erc8183Abi, data: tx.input });
    if (decoded.functionName !== "submit") return null;
    const optParams = decoded.args[2] as `0x${string}`;
    if (!optParams || optParams === "0x") return null;
    if (keccak256(optParams) !== committedHash) return null;
    return hexToString(optParams);
  } catch {
    return null;
  }
}

// Local pre-image storage for deliverables submitted through arcwork.
const key = (jobId: bigint) => `arcwork:deliverable:${jobId.toString()}`;

export function savePreimage(jobId: bigint, text: string): void {
  try {
    localStorage.setItem(key(jobId), text);
  } catch {
    // storage full/unavailable — proof still works via manual verify
  }
}

export function getPreimage(jobId: bigint): string | null {
  return localStorage.getItem(key(jobId));
}
