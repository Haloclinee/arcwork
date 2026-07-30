import { useReadContract, useReadContracts } from "wagmi";
import { zeroAddress } from "viem";
import { ERC8183_ADDRESS, erc8183Abi, JOB_STATUS, type Job } from "../lib/arc";
import { fmtUsdc, shortAddr, timeLeft } from "../lib/format";
import { Identity } from "../components/Identity";
import { RatingBadge } from "../components/StarRating";
import { TipsBadge } from "../components/TipJudge";
import { EVALUATOR_PRESETS } from "../lib/presets";

// Live getJob() readout — whatever the newest job on-chain actually is,
// never a curated example. If it's quiet, the card is quiet.
function HeroCodeCard({ job }: { job: Job | null | undefined }) {
  if (!job) {
    return (
      <div className="code-card">
        <div className="code-bar">
          <span className="code-dot" /><span className="code-dot" /><span className="code-dot" />
          <span className="code-file">getJob()</span>
        </div>
        <div className="code-body">loading…</div>
      </div>
    );
  }
  const status = JOB_STATUS[job.status] ?? "?";
  const chipClass = status === "Completed" ? "ok" : status === "Rejected" ? "no" : "pending";
  const chipLabel =
    status === "Completed" ? "payout released" :
    status === "Rejected" ? "refunded to client" :
    status === "Open" ? "awaiting provider" :
    status.toLowerCase();
  return (
    <div className="code-card">
      <div className="code-bar">
        <span className="code-dot" /><span className="code-dot" /><span className="code-dot" />
        <span className="code-file">getJob({job.id.toString()})</span>
      </div>
      <div className="code-body">
        <div><span className="k">status</span>: <span className="s">"{status}"</span>,</div>
        <div><span className="k">client</span>: <span className="s">"{shortAddr(job.client)}"</span>,</div>
        <div>
          <span className="k">provider</span>:{" "}
          <span className="s">"{job.provider === zeroAddress ? "unassigned" : shortAddr(job.provider)}"</span>,
        </div>
        <div>
          <span className="k">budget</span>: <span className="n">{job.budget > 0n ? fmtUsdc(job.budget) : "0"}</span>{" "}
          <span className="s">USDC</span>
        </div>
        <div className={`status-chip ${chipClass}`}>{chipLabel}</div>
      </div>
    </div>
  );
}

function PreviewCard({ job }: { job: Job }) {
  const t = timeLeft(job.expiredAt);
  const desc = job.description.trim() || "(no description)";
  const status = JOB_STATUS[job.status] ?? "?";
  return (
    <a className="card" href={`#/job/${job.id}`}>
      <div className="card-top">
        <span className="job-id">#{job.id.toString()}</span>
        <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>
      </div>
      <p className="card-desc">{desc.length > 90 ? desc.slice(0, 90) + "…" : desc}</p>
      <div className="card-meta">
        <span className="budget">{job.budget > 0n ? `${fmtUsdc(job.budget)} USDC` : "budget not set"}</span>
        <span className={t.expired ? "muted expired" : "muted"}>{t.label}</span>
      </div>
    </a>
  );
}

export function LandingPage() {
  const { data: counter } = useReadContract({
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "jobCounter",
  });

  const previewIds = counter
    ? Array.from({ length: 6 }, (_, i) => counter - BigInt(i)).filter((id) => id >= 1n)
    : [];

  const { data: jobsData } = useReadContracts({
    contracts: previewIds.map((id) => ({
      address: ERC8183_ADDRESS,
      abi: erc8183Abi,
      functionName: "getJob" as const,
      args: [id] as const,
    })),
    query: { enabled: previewIds.length > 0 },
  });

  const jobs = (jobsData ?? [])
    .map((r) => (r.status === "success" ? (r.result as Job) : null))
    .filter((j): j is Job => j !== null);

  const judge = EVALUATOR_PRESETS[0];

  return (
    <>
      <section className="hero">
        <div>
          <span className="hero-eyebrow">Arc Testnet · ERC-8183</span>
          <h1>Escrow that pays out on verdict.</h1>
          <p>
            Post a job, fund it in USDC, and let a neutral judge release payment or refund the
            client — every step on the canonical ERC-8183 contract, shared with{" "}
            {counter ? counter.toLocaleString("en-US") : "159,000+"} other jobs.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#/new">Post a job</a>
            <a className="btn btn-ghost" href="#/jobs">Browse open jobs</a>
          </div>
        </div>
        <HeroCodeCard job={jobs[0]} />
      </section>

      {jobs.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Latest jobs</h2>
            <a className="win-rate" href="#/jobs">See all →</a>
          </div>
          <div className="grid">
            {jobs.slice(0, 6).map((j) => (
              <PreviewCard key={j.id.toString()} job={j} />
            ))}
          </div>
        </section>
      )}

      <section className="band">
        <span className="band-eyebrow">#/arena · live</span>
        <h2>Every node is a real wallet.</h2>
        <p style={{ maxWidth: "34rem", marginTop: "0.6rem" }}>
          Fund → submit → verdict events animate as they actually happen on-chain — polled
          straight from the canonical contract. Nothing simulated: if it's quiet, arcwork is quiet.
        </p>
        <div className="arena-row">
          <div className="arena-nodes">
            <div className="node"><div className="node-dot vault" /><span className="node-label">ERC-8183</span></div>
            {EVALUATOR_PRESETS.slice(0, 3).map((p) => (
              <div className="node" key={p.address}>
                <div className="node-dot judge" />
                <span className="node-label">{p.ansName}</span>
              </div>
            ))}
          </div>
          <a className="btn btn-secondary" href="#/arena">Watch live →</a>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Judges &amp; negotiation</h2></div>
        <div className="split">
          <div className="card judge-card">
            <div className="judge-name"><Identity address={judge.address} /></div>
            <div className="judge-rating"><RatingBadge judge={judge.address} /></div>
            <p className="judge-desc">{judge.description}</p>
            <TipsBadge judge={judge.address} />
          </div>
          <div className="chat-box">
            <div className="chat-header">💬 Message applicant</div>
            <div className="chat-messages">
              <div className="chat-msg chat-msg-them">Can you do this for 4 USDC instead of 5?</div>
              <div className="chat-msg chat-msg-me">Works for me — I'll apply now.</div>
            </div>
            <p className="muted small" style={{ padding: "0 14px 12px" }}>
              Wallet-to-wallet negotiation over XMTP — no arcwork backend, nothing touches the chain.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
