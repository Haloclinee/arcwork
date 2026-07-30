import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, timeLeft } from "../lib/format";
import { scanAddressHistory, type RepScan } from "../lib/reputation";
import { Identity } from "../components/Identity";

export function ReputationPage({ address }: { address: `0x${string}` }) {
  const publicClient = usePublicClient();
  const [scan, setScan] = useState<RepScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScan(null);
    setError(null);
    if (!publicClient) return;
    scanAddressHistory(publicClient, address, "provider")
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

  const completed = jobs.filter((j) => JOB_STATUS[j.status] === "Completed");
  const rejected = jobs.filter((j) => JOB_STATUS[j.status] === "Rejected");
  const active = jobs.filter((j) => ["Open", "Funded", "Submitted"].includes(JOB_STATUS[j.status]));
  const terminal = completed.length + rejected.length;
  const successRate = terminal > 0 ? Math.round((completed.length / terminal) * 100) : null;
  const earned = completed.reduce((acc, j) => acc + j.budget, 0n);

  return (
    <div className="detail">
      <a href="#/" className="muted back">← all jobs</a>
      <h1>
        Provider <Identity address={address} />
      </h1>
      <p className="muted">
        Recent on-chain track record on the canonical ERC-8183 contract
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
          No jobs found for this provider in the last ~{Math.round(scan.scannedBlocks / 1000)}k
          blocks. Public RPCs don't allow scanning further back — older history may exist.
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-num">{completed.length}</span>
              <span className="muted small">completed</span>
            </div>
            <div className="stat">
              <span className="stat-num">{rejected.length}</span>
              <span className="muted small">rejected</span>
            </div>
            <div className="stat">
              <span className="stat-num">{active.length}</span>
              <span className="muted small">in progress</span>
            </div>
            <div className="stat">
              <span className="stat-num">{successRate !== null ? `${successRate}%` : "—"}</span>
              <span className="muted small">success rate</span>
            </div>
            <div className="stat">
              <span className="stat-num">{fmtUsdc(earned)}</span>
              <span className="muted small">USDC earned</span>
            </div>
          </div>

          <table className="jobs-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Deadline</th>
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
                        {job.description.slice(0, 60)}
                        {job.description.length > 60 ? "…" : ""}
                      </span>
                    </td>
                    <td>
                      <span className={`pill pill-${JOB_STATUS[job.status].toLowerCase()}`}>
                        {JOB_STATUS[job.status]}
                      </span>
                    </td>
                    <td className="budget">{job.budget > 0n ? `${fmtUsdc(job.budget)} USDC` : "—"}</td>
                    <td className={t.expired ? "expired" : "muted"}>{t.label}</td>
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
