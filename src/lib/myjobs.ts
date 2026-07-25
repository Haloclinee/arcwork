// Local registry of jobs the connected address has touched through arcwork.
// Public Arc RPCs cap eth_getLogs at 10k blocks, so a full-history scan is not
// possible client-side — we track locally and offer a bounded recent-history scan.

export type Role = "client" | "provider" | "evaluator";

export interface MyJobEntry {
  id: string; // jobId as decimal string
  roles: Role[];
}

const key = (address: string) => `arcwork:myjobs:${address.toLowerCase()}`;

export function getMyJobs(address: string): MyJobEntry[] {
  try {
    const raw = localStorage.getItem(key(address));
    return raw ? (JSON.parse(raw) as MyJobEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordJob(address: string, jobId: bigint, roles: Role[]): void {
  if (roles.length === 0) return;
  const entries = getMyJobs(address);
  const id = jobId.toString();
  const existing = entries.find((e) => e.id === id);
  if (existing) {
    const merged = [...new Set([...existing.roles, ...roles])];
    if (merged.length === existing.roles.length) return;
    existing.roles = merged;
  } else {
    entries.push({ id, roles });
  }
  localStorage.setItem(key(address), JSON.stringify(entries));
}
