import type { PublicClient } from "viem";
import { ERC8183_ADDRESS } from "./arc";
import { jobCreatedEvent, jobSubmittedEvent } from "./events";

const CHUNK = 9_500n;
const MAX_CHUNKS = 20; // ≈190k blocks of recent history (public RPC scan cap)

export type HistoryField = "provider" | "evaluator";

export interface RepScan {
  jobIds: string[]; // newest first
  scannedBlocks: number;
  scannedAt: number;
}

const key = (field: HistoryField, address: string) => `arcwork:rep:${field}:${address.toLowerCase()}`;
const TTL_MS = 10 * 60 * 1000;

// Scans recent logs for jobs where `address` played `field` (provider or
// evaluator). `provider` is only set on JobCreated for direct-hire jobs —
// most jobs are created open and assigned later via setProvider(), which
// emits no event — so provider history is scanned off JobSubmitted instead,
// which every real provider hits once they deliver and is indexed there.
// `evaluator` is not indexed on JobCreated, so viem decodes every log in
// range and filters client-side. Both are bounded by the public-RPC 10k-block cap.
export async function scanAddressHistory(
  client: PublicClient,
  address: `0x${string}`,
  field: HistoryField,
): Promise<RepScan> {
  const cacheKey = key(field, address);
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached) as RepScan;
    if (Date.now() - parsed.scannedAt < TTL_MS) return parsed;
  }

  const latest = await client.getBlockNumber();
  const ids: string[] = [];
  let chunks = 0;
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const toBlock = latest - CHUNK * BigInt(i);
    if (toBlock < 1n) break;
    let fromBlock = toBlock - CHUNK + 1n;
    if (fromBlock < 1n) fromBlock = 1n;
    const logs = await (field === "provider"
      ? client.getLogs({
          address: ERC8183_ADDRESS,
          event: jobSubmittedEvent,
          args: { provider: address },
          fromBlock,
          toBlock,
        })
      : client.getLogs({
          address: ERC8183_ADDRESS,
          event: jobCreatedEvent,
          args: { evaluator: address } as unknown as { provider?: `0x${string}` },
          fromBlock,
          toBlock,
        }));
    for (const log of logs) {
      if (log.args.jobId !== undefined) ids.push(log.args.jobId.toString());
    }
    chunks++;
  }
  ids.sort((a, b) => Number(BigInt(b) - BigInt(a)));

  const result: RepScan = {
    jobIds: [...new Set(ids)],
    scannedBlocks: chunks * Number(CHUNK),
    scannedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
  } catch {
    // cache miss is fine
  }
  return result;
}
