import { usePublicClient, useReadContracts } from "wagmi";
import { useEffect, useState } from "react";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { scanAddressHistory, type RepScan } from "../lib/reputation";

// Compact inline reputation summary for an applicant row — armut.com-style
// "see their track record before you pick them" without leaving the job page.
export function WinRateBadge({ address }: { address: `0x${string}` }) {
  const publicClient = usePublicClient();
  const [scan, setScan] = useState<RepScan | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!publicClient) return;
    scanAddressHistory(publicClient, address, "provider").then((r) => !cancelled && setScan(r));
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  const { data: jobsData } = useReadContracts({
    contracts: (scan?.jobIds ?? []).slice(0, 50).map((id) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: (scan?.jobIds.length ?? 0) > 0 },
  });

  if (!scan) return <span className="win-rate muted small">…</span>;
  if (scan.jobIds.length === 0) return <span className="win-rate muted small">no history yet</span>;

  const jobs = (jobsData ?? [])
    .map((r) => (r.status === "success" ? (r.result as Job) : null))
    .filter((j): j is Job => j !== null);
  const completed = jobs.filter((j) => JOB_STATUS[j.status] === "Completed").length;
  const rejected = jobs.filter((j) => JOB_STATUS[j.status] === "Rejected").length;
  const terminal = completed + rejected;

  if (terminal === 0) return <span className="win-rate muted small">no completed jobs yet</span>;

  const rate = Math.round((completed / terminal) * 100);
  return (
    <a href={`#/rep/${address}`} className="win-rate" title="View full track record">
      {rate}% win rate <span className="muted small">({completed}/{terminal})</span>
    </a>
  );
}
