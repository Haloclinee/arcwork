import type { PublicClient } from "viem";
import { ERC8183_ADDRESS } from "./arc";

// Verified shape: JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)
export const jobSubmittedEvent = {
  type: "event",
  name: "JobSubmitted",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "deliverable", type: "bytes32", indexed: false },
  ],
} as const;

const CHUNK = 9_500n; // public RPCs cap eth_getLogs at 10k blocks
const MAX_CHUNKS = 30;

export interface DeliverableProof {
  hash: `0x${string}`;
  txHash: `0x${string}`;
  blockNumber: bigint;
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
      };
    }
  }
  return "out-of-range";
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
