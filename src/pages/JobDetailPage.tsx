import { useEffect, useState } from "react";
import { keccak256, parseUnits, stringToHex, toHex, zeroAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import {
  ERC8183_ADDRESS,
  USDC_ADDRESS,
  USDC_DECIMALS,
  erc20Abi,
  erc8183Abi,
  JOB_STATUS,
  type Job,
} from "../lib/arc";
import { fmtDate, fmtUsdc, shortAddr, timeLeft } from "../lib/format";
import { recordJob, type Role } from "../lib/myjobs";
import { savePreimage } from "../lib/deliverable";
import { DeliverablePanel } from "../components/DeliverablePanel";

// Short human reason packed into bytes32 (right-padded, truncated to 31 bytes).
function reasonBytes32(s: string): `0x${string}` {
  const trimmed = s.trim() || "ok";
  return stringToHex(trimmed.slice(0, 31), { size: 32 });
}

function AddrRow({ label, addr, you }: { label: string; addr: string; you?: boolean }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span className="mono">
        {addr === zeroAddress ? "—" : shortAddr(addr)}
        {you && <span className="you"> you</span>}
      </span>
    </div>
  );
}

export function JobDetailPage({ jobId }: { jobId: bigint }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [providerInput, setProviderInput] = useState("");
  const [deliverableInput, setDeliverableInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");

  const { data: job, refetch } = useReadContract({
    address: ERC8183_ADDRESS,
    abi: erc8183Abi,
    functionName: "getJob",
    args: [jobId],
  });

  // Track this job in "My jobs" when the connected wallet is a participant.
  useEffect(() => {
    if (!job || !address) return;
    const jj = job as Job;
    const my = address.toLowerCase();
    const roles: Role[] = [];
    if (jj.client.toLowerCase() === my) roles.push("client");
    if (jj.provider.toLowerCase() === my) roles.push("provider");
    if (jj.evaluator.toLowerCase() === my) roles.push("evaluator");
    recordJob(address, jobId, roles);
  }, [job, address, jobId]);

  if (!job) return <div className="empty">Loading job #{jobId.toString()}…</div>;
  const j = job as Job;
  const status = JOB_STATUS[j.status];
  const me = address?.toLowerCase();
  const isClient = me === j.client.toLowerCase();
  const isProvider = me === j.provider.toLowerCase();
  const isEvaluator = me === j.evaluator.toLowerCase();
  const t = timeLeft(j.expiredAt);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(null);
    }
  }

  async function sendAndWait(args: Parameters<typeof writeContractAsync>[0]) {
    const hash = await writeContractAsync(args);
    await publicClient!.waitForTransactionReceipt({ hash });
  }

  const setBudget = () =>
    run("setBudget", async () => {
      const amount = parseUnits(budgetInput || "0", USDC_DECIMALS);
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "setBudget",
        args: [jobId, amount, "0x"],
      });
    });

  const setProvider = () =>
    run("setProvider", async () => {
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "setProvider",
        args: [jobId, providerInput.trim() as `0x${string}`],
      });
    });

  const fund = () =>
    run("fund", async () => {
      const allowance = await publicClient!.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, ERC8183_ADDRESS],
      });
      if (allowance < j.budget) {
        await sendAndWait({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ERC8183_ADDRESS, j.budget],
        });
      }
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "fund",
        args: [jobId, "0x"],
      });
    });

  const submit = () =>
    run("submit", async () => {
      const raw = deliverableInput.trim();
      // A URL/text deliverable is hashed; a ready 0x…64 hash is passed through.
      const deliverable = /^0x[0-9a-fA-F]{64}$/.test(raw)
        ? (raw as `0x${string}`)
        : keccak256(toHex(raw));
      savePreimage(jobId, raw);
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "submit",
        args: [jobId, deliverable, "0x"],
      });
    });

  const complete = () =>
    run("complete", async () => {
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "complete",
        args: [jobId, reasonBytes32(reasonInput || "approved"), "0x"],
      });
    });

  const reject = () =>
    run("reject", async () => {
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "reject",
        args: [jobId, reasonBytes32(reasonInput || "rejected"), "0x"],
      });
    });

  const claimRefund = () =>
    run("claimRefund", async () => {
      await sendAndWait({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "claimRefund",
        args: [jobId],
      });
    });

  const canFund =
    status === "Open" && isClient && j.provider !== zeroAddress && j.budget > 0n && !t.expired;

  return (
    <div className="detail">
      <a href="#/" className="muted back">← all jobs</a>
      <div className="detail-head">
        <h1>
          Job #{jobId.toString()} <span className={`pill pill-${status.toLowerCase()}`}>{status}</span>
        </h1>
        <div className="budget-big">
          {j.budget > 0n ? `${fmtUsdc(j.budget)} USDC` : "budget not set"}
        </div>
      </div>

      <p className="detail-desc">{j.description || <span className="muted">(no description)</span>}</p>

      <div className="kv-grid">
        <AddrRow label="Client" addr={j.client} you={isClient} />
        <AddrRow label="Provider" addr={j.provider} you={isProvider} />
        <AddrRow label="Evaluator" addr={j.evaluator} you={isEvaluator} />
        <div className="kv">
          <span className="muted">Expires</span>
          <span>
            {fmtDate(j.expiredAt)} <span className={t.expired ? "expired" : "muted"}>({t.label})</span>
          </span>
        </div>
        <div className="kv">
          <span className="muted">Submitted</span>
          <span>{fmtDate(j.submittedAt)}</span>
        </div>
        <div className="kv">
          <span className="muted">Contract</span>
          <a
            className="mono"
            href={`https://testnet.arcscan.app/address/${ERC8183_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(ERC8183_ADDRESS)}
          </a>
        </div>
      </div>

      {(status === "Submitted" || status === "Completed" || status === "Rejected") && (
        <DeliverablePanel jobId={jobId} />
      )}

      {error && <div className="error">{error}</div>}

      {!address ? (
        <div className="hint">Connect your wallet to interact with this job.</div>
      ) : (
        <div className="actions">
          {/* ── Open ── */}
          {status === "Open" && isClient && j.provider === zeroAddress && (
            <div className="action-box">
              <h3>Assign a provider</h3>
              <div className="row">
                <input
                  placeholder="0x… provider address"
                  value={providerInput}
                  onChange={(e) => setProviderInput(e.target.value)}
                />
                <button className="btn btn-primary" disabled={busy !== null} onClick={setProvider}>
                  {busy === "setProvider" ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          )}
          {status === "Open" && isProvider && (
            <div className="action-box">
              <h3>Set your budget</h3>
              <p className="muted small">The amount of USDC the client will escrow for this job.</p>
              <div className="row">
                <input
                  placeholder="e.g. 100"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  inputMode="decimal"
                />
                <button className="btn btn-primary" disabled={busy !== null} onClick={setBudget}>
                  {busy === "setBudget" ? "Setting…" : "Set budget"}
                </button>
              </div>
            </div>
          )}
          {canFund && (
            <div className="action-box">
              <h3>Fund escrow</h3>
              <p className="muted small">
                Locks {fmtUsdc(j.budget)} USDC in the contract. Approves USDC first if needed.
              </p>
              <button className="btn btn-primary" disabled={busy !== null} onClick={fund}>
                {busy === "fund" ? "Funding…" : `Approve & fund ${fmtUsdc(j.budget)} USDC`}
              </button>
            </div>
          )}
          {status === "Open" && (isClient || isProvider) && (
            <div className="action-box">
              <h3>Cancel job</h3>
              <button className="btn btn-danger" disabled={busy !== null} onClick={reject}>
                {busy === "reject" ? "Cancelling…" : "Cancel (reject)"}
              </button>
            </div>
          )}

          {/* ── Funded ── */}
          {status === "Funded" && isProvider && !t.expired && (
            <div className="action-box">
              <h3>Submit your work</h3>
              <p className="muted small">
                Paste a link or text — it's hashed (keccak256) and stored on-chain as the deliverable.
              </p>
              <div className="row">
                <input
                  placeholder="https://… or a 0x… hash"
                  value={deliverableInput}
                  onChange={(e) => setDeliverableInput(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={busy !== null || !deliverableInput.trim()}
                  onClick={submit}
                >
                  {busy === "submit" ? "Submitting…" : "Submit"}
                </button>
              </div>
            </div>
          )}
          {status === "Funded" && isEvaluator && (
            <div className="action-box">
              <h3>Reject &amp; refund client</h3>
              <div className="row">
                <input
                  placeholder="reason (short)"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                />
                <button className="btn btn-danger" disabled={busy !== null} onClick={reject}>
                  {busy === "reject" ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </div>
          )}

          {/* ── Submitted ── */}
          {status === "Submitted" && isEvaluator && (
            <div className="action-box">
              <h3>Evaluate the submission</h3>
              <div className="row">
                <input
                  placeholder="reason (short)"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                />
                <button className="btn btn-primary" disabled={busy !== null} onClick={complete}>
                  {busy === "complete" ? "Paying out…" : "Approve & pay provider"}
                </button>
                <button className="btn btn-danger" disabled={busy !== null} onClick={reject}>
                  {busy === "reject" ? "Rejecting…" : "Reject & refund"}
                </button>
              </div>
            </div>
          )}

          {/* ── Expiry ── */}
          {t.expired && (status === "Open" || status === "Funded" || status === "Submitted") && (
            <div className="action-box">
              <h3>Job expired</h3>
              <p className="muted small">
                Anyone can finalize an expired job; escrowed funds return to the client.
                {status === "Submitted" && " (1h evaluator grace period applies after expiry.)"}
              </p>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={claimRefund}>
                {busy === "claimRefund" ? "Finalizing…" : "Finalize & refund"}
              </button>
            </div>
          )}

          {!isClient && !isProvider && !isEvaluator && !t.expired && (
            <div className="hint">
              You're not a participant in this job — connect as the client, provider, or evaluator to act.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
