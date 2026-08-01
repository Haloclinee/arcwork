import type { PublicClient } from "viem";
import { ERC8183_ADDRESS } from "./arc";
import { jobCreatedEvent, jobSubmittedEvent } from "./events";

const CHUNK = 9_500n;
const MAX_CHUNKS = 120; // ≈1.14M blocks of history (public RPC scan cap is 10k/request)
const CONCURRENCY = 8; // chunks are independent — fetch in parallel batches, not one at a time

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

  // Build every chunk's [fromBlock, toBlock] range up front, then fetch in
  // parallel batches — chunks are independent reads, no reason to await
  // them one at a time (that's what made deep history scans feel like they
  // "didn't find" older jobs: MAX_CHUNKS was small AND the loop was serial).
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const toBlock = latest - CHUNK * BigInt(i);
    if (toBlock < 1n) break;
    let fromBlock = toBlock - CHUNK + 1n;
    if (fromBlock < 1n) fromBlock = 1n;
    ranges.push({ fromBlock, toBlock });
    if (fromBlock <= 1n) break;
  }

  const ids: string[] = [];
  let chunks = 0;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ fromBlock, toBlock }) =>
        field === "provider"
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
            }),
      ),
    );
    for (const logs of results) {
      for (const log of logs) {
        if (log.args.jobId !== undefined) ids.push(log.args.jobId.toString());
      }
      chunks++;
    }
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
