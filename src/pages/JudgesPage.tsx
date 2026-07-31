import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { EVALUATOR_PRESETS } from "../lib/presets";
import { scanAddressHistory } from "../lib/reputation";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { RatingBadge } from "../components/StarRating";
import { TipsBadge } from "../components/TipJudge";

interface JudgeStats {
  judged: number;
  approved: number;
  rejected: number;
  approvalRate: number | null;
  loading: boolean;
}

function JudgeCard({ preset }: { preset: (typeof EVALUATOR_PRESETS)[number] }) {
  const publicClient = usePublicClient();
  const [jobIds, setJobIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!publicClient) return;
    scanAddressHistory(publicClient, preset.address, "evaluator").then(
      (r) => !cancelled && setJobIds(r.jobIds.slice(0, 50)),
    );
    return () => {
      cancelled = true;
    };
  }, [publicClient, preset.address]);

  const { data: jobsData } = useReadContracts({
    contracts: (jobIds ?? []).map((id) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: (jobIds?.length ?? 0) > 0 },
  });

  const stats: JudgeStats = (() => {
    if (jobIds === null) return { judged: 0, approved: 0, rejected: 0, approvalRate: null, loading: true };
    const jobs = (jobsData ?? [])
      .map((r) => (r.status === "success" ? (r.result as Job) : null))
      .filter((j): j is Job => j !== null);
    const approved = jobs.filter((j) => JOB_STATUS[j.status] === "Completed").length;
    const rejected = jobs.filter((j) => JOB_STATUS[j.status] === "Rejected").length;
    const judged = approved + rejected;
    return {
      judged,
      approved,
      rejected,
      approvalRate: judged > 0 ? Math.round((approved / judged) * 100) : null,
      loading: jobIds.length > 0 && !jobsData,
    };
  })();

  return (
    <a className="card judge-card" href={`#/judge/${preset.address}`}>
      <div className="card-top">
        <span className="ans-name judge-card-name">
          {preset.ansName}<span className="ans-suffix">.arc</span>
        </span>
        <RatingBadge judge={preset.address} />
      </div>
      <p className="card-desc">{preset.description}</p>
      <TipsBadge judge={preset.address} />
      {stats.loading ? (
        <div className="muted small">Loading track record…</div>
      ) : stats.judged === 0 ? (
        <div className="muted small">No judged jobs in recent history yet.</div>
      ) : (
        <div className="card-meta">
          <span>
            <strong>{stats.judged}</strong> judged
          </span>
          <span className="budget">{stats.approvalRate}% approval</span>
        </div>
      )}
    </a>
  );
}

export function JudgesPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Judges</h1>
          <p className="muted">
            12 independent evaluator agents, each judging with a different model — no stake in
            the client's or provider's outcome, and none of them see how the others voted. Pick
            one when posting a job, or bring your own address.
          </p>
        </div>
      </div>
      <div className="grid">
        {EVALUATOR_PRESETS.map((p) => (
          <JudgeCard key={p.address} preset={p} />
        ))}
      </div>
    </>
  );
}
