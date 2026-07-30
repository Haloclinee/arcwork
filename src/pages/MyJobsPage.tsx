import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, timeLeft } from "../lib/format";
import { getMyJobs, recordJob, type Role } from "../lib/myjobs";
import { jobCreatedEvent } from "../lib/events";

const SCAN_CHUNK = 9_500n; // stay under the 10k getLogs cap
const SCAN_CHUNKS = 20; // ≈190k blocks of recent history

export function MyJobsPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [version, setVersion] = useState(0); // bump to re-read localStorage
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const entries = useMemo(
    () => (address ? getMyJobs(address) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, version],
  );

  const sorted = useMemo(
    () => [...entries].sort((a, b) => Number(BigInt(b.id) - BigInt(a.id))),
    [entries],
  );

  const { data: jobsData } = useReadContracts({
    contracts: sorted.map((e) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [BigInt(e.id)] as const,
    })),
    query: { enabled: sorted.length > 0 },
  });

  async function scanRecent() {
    if (!address || !publicClient) return;
    setScanning(true);
    setScanNote(null);
    try {
      const latest = await publicClient.getBlockNumber();
      let found = 0;
      for (let i = 0; i < SCAN_CHUNKS; i++) {
        const toBlock = latest - SCAN_CHUNK * BigInt(i);
        const fromBlock = toBlock - SCAN_CHUNK + 1n;
        if (toBlock < 1n) break;
        const [asClient, asProvider] = await Promise.all([
          publicClient.getLogs({
            address: ERC8183_ADDRESS,
            event: jobCreatedEvent,
            args: { client: address },
            fromBlock: fromBlock < 1n ? 1n : fromBlock,
            toBlock,
          }),
          publicClient.getLogs({
            address: ERC8183_ADDRESS,
            event: jobCreatedEvent,
            args: { provider: address },
            fromBlock: fromBlock < 1n ? 1n : fromBlock,
            toBlock,
          }),
        ]);
        for (const log of asClient) {
          if (log.args.jobId !== undefined) {
            recordJob(address, log.args.jobId, ["client"]);
            found++;
          }
        }
        for (const log of asProvider) {
          if (log.args.jobId !== undefined) {
            recordJob(address, log.args.jobId, ["provider"]);
            found++;
          }
        }
      }
      setScanNote(
        found > 0
          ? `Scan found ${found} job(s) in the last ~190k blocks.`
          : "No jobs found in the last ~190k blocks. (Public RPCs don't allow scanning further back — jobs you touch through arcwork are tracked automatically.)",
      );
      setVersion((v) => v + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanNote(`Scan stopped early: ${msg.split("\n")[0].slice(0, 120)}`);
      setVersion((v) => v + 1);
    } finally {
      setScanning(false);
    }
  }

  if (!address) {
    return <div className="empty">Connect your wallet to see your jobs.</div>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My jobs</h1>
          <p className="muted">
            Jobs you've created or worked on. Tracked locally as you use arcwork.
          </p>
        </div>
        <button className="btn btn-ghost" disabled={scanning} onClick={scanRecent}>
          {scanning ? "Scanning…" : "Scan recent history"}
        </button>
      </div>

      {scanNote && <div className="hint">{scanNote}</div>}

      {sorted.length === 0 ? (
        <div className="empty">
          Nothing here yet — <a href="#/new" style={{ color: "var(--color-accent)" }}>post a job</a> or
          open a job you participate in, and it'll show up.
        </div>
      ) : (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Your role</th>
              <th>Status</th>
              <th>Budget</th>
              <th>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const r = jobsData?.[i];
              const job = r?.status === "success" ? (r.result as Job) : null;
              const t = job ? timeLeft(job.expiredAt) : null;
              return (
                <tr
                  key={entry.id}
                  onClick={() => (window.location.hash = `#/job/${entry.id}`)}
                >
                  <td>
                    <span className="job-id">#{entry.id}</span>{" "}
                    <span className="row-desc">
                      {job
                        ? job.description.slice(0, 60) + (job.description.length > 60 ? "…" : "")
                        : "…"}
                    </span>
                  </td>
                  <td className="muted">{entry.roles.join(" · ")}</td>
                  <td>
                    {job && (
                      <span className={`pill pill-${JOB_STATUS[job.status].toLowerCase()}`}>
                        {JOB_STATUS[job.status]}
                      </span>
                    )}
                  </td>
                  <td className="budget">{job && job.budget > 0n ? `${fmtUsdc(job.budget)} USDC` : "—"}</td>
                  <td className={t?.expired ? "expired" : "muted"}>{t?.label ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export type { Role };
