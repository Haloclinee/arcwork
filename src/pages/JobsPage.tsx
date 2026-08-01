import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { parseUnits, zeroAddress } from "viem";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, timeLeft } from "../lib/format";
import { Identity } from "../components/Identity";
import { EVALUATOR_PRESETS } from "../lib/presets";

const PAGE_SIZE = 12;
const WIDE_WINDOW = 3000; // how far back to scan when a filter is active

interface Filters {
  statuses: string[]; // subset of JOB_STATUS; [] = all
  minBudget: string;
  maxBudget: string;
  judge: "any" | "ai" | "custom";
  unassignedOnly: boolean;
}

const DEFAULT_FILTERS: Filters = {
  statuses: [],
  minBudget: "",
  maxBudget: "",
  judge: "any",
  unassignedOnly: false,
};

function isFilterActive(f: Filters): boolean {
  return (
    f.statuses.length > 0 ||
    f.minBudget !== "" ||
    f.maxBudget !== "" ||
    f.judge !== "any" ||
    f.unassignedOnly
  );
}

function parseUsdcSafe(s: string): bigint | null {
  if (s.trim() === "") return null;
  try {
    return parseUnits(s.trim(), 6);
  } catch {
    return null;
  }
}

function isAiJudge(evaluator: string): boolean {
  return EVALUATOR_PRESETS.some((p) => p.address.toLowerCase() === evaluator.toLowerCase());
}

function StatusPill({ status }: { status: number }) {
  const label = JOB_STATUS[status] ?? "?";
  return <span className={`pill pill-${label.toLowerCase()}`}>{label}</span>;
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const toggleStatus = (s: string) => {
    const has = filters.statuses.includes(s);
    onChange({ ...filters, statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s] });
  };
  const active = isFilterActive(filters);

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Status</span>
        <div className="chip-row">
          {JOB_STATUS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${filters.statuses.includes(s) ? "chip-active" : ""}`}
              onClick={() => toggleStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Budget (USDC)</span>
        <div className="row">
          <input
            placeholder="min"
            value={filters.minBudget}
            onChange={(e) => onChange({ ...filters, minBudget: e.target.value })}
            inputMode="decimal"
            style={{ width: 90 }}
          />
          <span className="muted">–</span>
          <input
            placeholder="max"
            value={filters.maxBudget}
            onChange={(e) => onChange({ ...filters, maxBudget: e.target.value })}
            inputMode="decimal"
            style={{ width: 90 }}
          />
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Judge</span>
        <div className="chip-row">
          {(["any", "ai", "custom"] as const).map((j) => (
            <button
              key={j}
              type="button"
              className={`chip ${filters.judge === j ? "chip-active" : ""}`}
              onClick={() => onChange({ ...filters, judge: j })}
            >
              {j === "any" ? "Any" : j === "ai" ? "AI judge" : "Custom evaluator"}
            </button>
          ))}
        </div>
      </div>

      <label className="filter-checkbox">
        <input
          type="checkbox"
          checked={filters.unassignedOnly}
          onChange={(e) => onChange({ ...filters, unassignedOnly: e.target.checked })}
        />
        No provider pinned yet
      </label>

      {active && (
        <button className="btn btn-ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
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
        <span>client <Identity address={job.client} /></span>
        <span>
          {job.provider === zeroAddress ? (
            "open to providers"
          ) : (
            <>provider <Identity address={job.provider} /></>
          )}
        </span>
      </div>
    </a>
  );
}

export function JobsPage() {
  const [page, setPage] = useState(0);
  const [lookup, setLookup] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const active = isFilterActive(filters);

  useEffect(() => {
    setPage(0);
  }, [filters]);

  const { data: counter, isLoading: counterLoading } = useReadContract({
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "jobCounter",
  });

  // Narrow window (fast) when unfiltered; wide window (scan + filter client-side) otherwise.
  const ids = useMemo(() => {
    if (!counter) return [];
    if (active) {
      const n = counter > BigInt(WIDE_WINDOW) ? BigInt(WIDE_WINDOW) : counter;
      const out: bigint[] = [];
      for (let i = 0n; i < n; i++) out.push(counter - i);
      return out;
    }
    const newest = counter - BigInt(page * PAGE_SIZE);
    const out: bigint[] = [];
    for (let i = 0n; i < BigInt(PAGE_SIZE) && newest - i >= 1n; i++) out.push(newest - i);
    return out;
  }, [counter, page, active]);

  const { data: jobsData, isLoading } = useReadContracts({
    contracts: ids.map((id) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [id] as const,
    })),
    query: { enabled: ids.length > 0 },
  });

  const fetchedJobs = (jobsData ?? [])
    .map((r) => (r.status === "success" ? (r.result as Job) : null))
    .filter((j): j is Job => j !== null);

  const filteredJobs = useMemo(() => {
    if (!active) return fetchedJobs;
    const min = parseUsdcSafe(filters.minBudget);
    const max = parseUsdcSafe(filters.maxBudget);
    return fetchedJobs.filter((j) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(JOB_STATUS[j.status])) return false;
      if (filters.unassignedOnly && j.provider !== zeroAddress) return false;
      if (min !== null && j.budget < min) return false;
      if (max !== null && j.budget > max) return false;
      if (filters.judge === "ai" && !isAiJudge(j.evaluator)) return false;
      if (filters.judge === "custom" && isAiJudge(j.evaluator)) return false;
      return true;
    });
  }, [fetchedJobs, filters, active]);

  const pageJobs = active ? filteredJobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : fetchedJobs;
  const hasOlder = active
    ? filteredJobs.length > (page + 1) * PAGE_SIZE
    : !!counter && counter - BigInt((page + 1) * PAGE_SIZE) >= 1n;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Latest jobs</h1>
          <p className="muted">
            {counter !== undefined
              ? `${counter.toLocaleString("en-US")} jobs created on the canonical ERC-8183 contract`
              : " "}
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

      <FilterBar filters={filters} onChange={setFilters} />
      {active && (
        <p className="muted small" style={{ margin: "0 0 16px" }}>
          Scanning the last {Math.min(Number(counter ?? 0n), WIDE_WINDOW)} jobs — {filteredJobs.length} match.
        </p>
      )}

      {counterLoading || isLoading ? (
        <div className="empty">Loading jobs…</div>
      ) : pageJobs.length === 0 ? (
        <div className="empty">No jobs match these filters.</div>
      ) : (
        <div className="grid">
          {pageJobs.map((job) => (
            <JobCard key={job.id.toString()} job={job} />
          ))}
        </div>
      )}

      <div className="pager">
        <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          ← Newer
        </button>
        <span className="muted">page {page + 1}</span>
        <button className="btn btn-ghost" disabled={!hasOlder} onClick={() => setPage((p) => p + 1)}>
          Older →
        </button>
      </div>
    </>
  );
}
