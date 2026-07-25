import { useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, shortAddr, timeLeft } from "../lib/format";

const PAGE_SIZE = 12;

function StatusPill({ status }: { status: number }) {
  const label = JOB_STATUS[status] ?? "?";
  return <span className={`pill pill-${label.toLowerCase()}`}>{label}</span>;
}

function JobCard({ job }: { job: Job }) {
  const t = timeLeft(job.expiredAt);
  const desc = job.description.trim() || "(no description)";
  return (
    <a className="card" href={`#/job/${job.id}`}>
      <div className="card-top">
        <span className="job-id">#{job.id.toString()}</span>
        <StatusPill status={job.status} />
      </div>
      <p className="card-desc">{desc.length > 140 ? desc.slice(0, 140) + "…" : desc}</p>
      <div className="card-meta">
        <span className="budget">
          {job.budget > 0n ? `${fmtUsdc(job.budget)} USDC` : "budget not set"}
        </span>
        <span className={t.expired ? "muted expired" : "muted"}>{t.label}</span>
      </div>
      <div className="card-meta muted small">
        <span>client {shortAddr(job.client)}</span>
        <span>
          {job.provider === "0x0000000000000000000000000000000000000000"
            ? "open to providers"
            : `provider ${shortAddr(job.provider)}`}
        </span>
      </div>
    </a>
  );
}

export function JobsPage() {
  const [page, setPage] = useState(0);
  const [lookup, setLookup] = useState("");

  const { data: counter, isLoading: counterLoading } = useReadContract({
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "jobCounter",
  });

  const ids = useMemo(() => {
    if (!counter) return [];
    const newest = counter - BigInt(page * PAGE_SIZE);
    const out: bigint[] = [];
    for (let i = 0n; i < BigInt(PAGE_SIZE) && newest - i >= 1n; i++) out.push(newest - i);
    return out;
  }, [counter, page]);

  const { data: jobsData, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [id] as const,
    })),
    query: { enabled: ids.length > 0 },
  });

  const jobs = (jobsData ?? [])
    .map((r) => (r.status === "success" ? (r.result as Job) : null))
    .filter((j): j is Job => j !== null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Latest jobs</h1>
          <p className="muted">
            {counter !== undefined
              ? `${counter.toLocaleString()} jobs created on the canonical ERC-8183 contract`
              : " "}
          </p>
        </div>
        <form
          className="lookup"
          onSubmit={(e) => {
            e.preventDefault();
            const id = lookup.trim().replace(/^#/, "");
            if (/^\d+$/.test(id)) window.location.hash = `#/job/${id}`;
          }}
        >
          <input
            placeholder="Go to job #…"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            inputMode="numeric"
          />
        </form>
      </div>

      {counterLoading || isLoading ? (
        <div className="empty">Loading jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="empty">No jobs found.</div>
      ) : (
        <div className="grid">
          {jobs.map((job) => (
            <JobCard key={job.id.toString()} job={job} />
          ))}
        </div>
      )}

      <div className="pager">
        <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          ← Newer
        </button>
        <span className="muted">page {page + 1}</span>
        <button
          className="btn btn-ghost"
          disabled={!counter || counter - BigInt((page + 1) * PAGE_SIZE) < 1n}
          onClick={() => setPage((p) => p + 1)}
        >
          Older →
        </button>
      </div>
    </>
  );
}
