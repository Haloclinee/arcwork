import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, timeLeft } from "../lib/format";
import { scanAddressHistory, type RepScan } from "../lib/reputation";
import { Identity } from "../components/Identity";
import { EVALUATOR_PRESETS } from "../lib/presets";
import { RatingBadge } from "../components/StarRating";
import { TipsBadge } from "../components/TipJudge";

export function JudgeHistoryPage({ address }: { address: `0x${string}` }) {
  const publicClient = usePublicClient();
  const [scan, setScan] = useState<RepScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preset = EVALUATOR_PRESETS.find((p) => p.address.toLowerCase() === address.toLowerCase());

  useEffect(() => {
    let cancelled = false;
    setScan(null);
    setError(null);
    if (!publicClient) return;
    scanAddressHistory(publicClient, address, "evaluator")
      .then((r) => !cancelled && setScan(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message.split("\n")[0] : String(e)));
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

  const jobs = (jobsData ?? [])
    .map((r) => (r.status === "success" ? (r.result as Job) : null))
    .filter((j): j is Job => j !== null);

  const approved = jobs.filter((j) => JOB_STATUS[j.status] === "Completed");
  const rejected = jobs.filter((j) => JOB_STATUS[j.status] === "Rejected");
  const pending = jobs.filter((j) => JOB_STATUS[j.status] === "Submitted");
  const judged = approved.length + rejected.length;
  const approvalRate = judged > 0 ? Math.round((approved.length / judged) * 100) : null;

  return (
    <div className="detail">
      <a href="#/judges" className="muted back">← all judges</a>
      <h1>
        Judge <Identity address={address} />
      </h1>
      <div className="row" style={{ margin: "-6px 0 10px", gap: 14 }}>
        <RatingBadge judge={address} />
        <TipsBadge judge={address} />
      </div>
      {preset && <p className="judge-desc">{preset.description}</p>}
      <p className="muted">
        On-chain verdict history on the canonical ERC-8183 contract
        {scan ? ` — last ~${Math.round(scan.scannedBlocks / 1000)}k blocks scanned` : ""}.{" "}
        <a
          href={`https://testnet.arcscan.app/address/${address}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)" }}
        >
          Arcscan ↗
        </a>
      </p>

      {error && <div className="error">{error}</div>}

      {!scan ? (
        <div className="empty">Scanning recent history…</div>
      ) : scan.jobIds.length === 0 ? (
        <div className="hint">
          No jobs found for this evaluator in the last ~{Math.round(scan.scannedBlocks / 1000)}k
          blocks. Public RPCs don't allow scanning further back — older history may exist.
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-num">{judged}</span>
              <span className="muted small">judged</span>
            </div>
            <div className="stat">
              <span className="stat-num">{approved.length}</span>
              <span className="muted small">approved</span>
            </div>
            <div className="stat">
              <span className="stat-num">{rejected.length}</span>
              <span className="muted small">rejected</span>
            </div>
            <div className="stat">
              <span className="stat-num">{pending.length}</span>
              <span className="muted small">awaiting verdict</span>
            </div>
            <div className="stat">
              <span className="stat-num">{approvalRate !== null ? `${approvalRate}%` : "—"}</span>
              <span className="muted small">approval rate</span>
            </div>
          </div>

          <table className="jobs-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Provider</th>
                <th>Verdict</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const t = timeLeft(job.expiredAt);
                return (
                  <tr key={job.id.toString()} onClick={() => (window.location.hash = `#/job/${job.id}`)}>
                    <td>
                      <span className="job-id">#{job.id.toString()}</span>{" "}
                      <span className="row-desc">
                        {job.description.slice(0, 50)}
                        {job.description.length > 50 ? "…" : ""}
                      </span>
                    </td>
                    <td>
                      <Identity address={job.provider} />
                    </td>
                    <td>
                      <span className={`pill pill-${JOB_STATUS[job.status].toLowerCase()}`}>
                        {JOB_STATUS[job.status]}
                      </span>
                      {JOB_STATUS[job.status] === "Submitted" && !t.expired && (
                        <span className="muted small"> · {t.label}</span>
                      )}
                    </td>
                    <td className="budget">{job.budget > 0n ? `${fmtUsdc(job.budget)} USDC` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
