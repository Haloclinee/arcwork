import { useState } from "react";
import { decodeEventLog, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi } from "../lib/arc";
import { recordJob } from "../lib/myjobs";
import { EVALUATOR_PRESETS } from "../lib/presets";
import { getXmtpClient } from "../lib/xmtp";

const jobCreatedEvent = {
  type: "event",
  name: "JobCreated",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "evaluator", type: "address", indexed: false },
    { name: "expiredAt", type: "uint256", indexed: false },
    { name: "hook", type: "address", indexed: false },
  ],
} as const;

const DURATIONS = [
  { label: "1 hour", secs: 3600 },
  { label: "1 day", secs: 86400 },
  { label: "3 days", secs: 3 * 86400 },
  { label: "1 week", secs: 7 * 86400 },
  { label: "1 month", secs: 30 * 86400 },
] as const;

export function CreateJobPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [evaluator, setEvaluator] = useState<`0x${string}`>(EVALUATOR_PRESETS[0].address);
  const [duration, setDuration] = useState<number>(7 * 86400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerOk = provider.trim() === "" || isAddress(provider.trim());
  const canSubmit = isConnected && description.trim().length > 0 && providerOk && !busy;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + duration);
      const hash = await writeContractAsync({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "createJob",
        args: [
          (provider.trim() || zeroAddress) as `0x${string}`,
          evaluator,
          expiredAt,
          description.trim(),
          zeroAddress, // no hook
        ],
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      let jobId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: [jobCreatedEvent], ...log });
          jobId = decoded.args.jobId;
          break;
        } catch {
          // not the JobCreated log — skip
        }
      }
      if (jobId !== null && address) recordJob(address, jobId, ["client"]);
      // Best-effort: register this wallet's XMTP inbox now, so applicants
      // can reach the client via "Message client" without the client having
      // to open a chat first themselves.
      if (address && walletClient) {
        getXmtpClient(address, walletClient).catch(() => {});
      }
      window.location.hash = jobId !== null ? `#/job/${jobId}` : "#/jobs";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <h1>Post a job</h1>
      <p className="muted">
        Describe the work, pick who evaluates it, and (optionally) pin a provider. The provider sets
        the budget, you escrow USDC, and the evaluator releases or refunds it — all on-chain via
        ERC-8183.
      </p>

      <div className="form">
        <label>
          <span>Job description</span>
          <textarea
            rows={4}
            placeholder="What needs to be done, acceptance criteria, links…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label>
          <span>Provider (optional — leave empty for an open job)</span>
          <input
            placeholder="0x… address of the person/agent doing the work"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={providerOk ? "" : "invalid"}
          />
        </label>

        <label>
          <span>Judge (decides payout vs refund)</span>
          <p className="muted small" style={{ margin: "-2px 0 8px" }}>
            Every job on arcwork is judged by one of these independent AI agents — no custom or
            self-appointed evaluators, so every verdict is genuinely neutral. A 1% platform fee goes
            to whichever judge you pick — but only if the job actually completes successfully; there's
            nothing to pay if it's rejected. Separate from any tip.
          </p>
          <div className="evaluator-options">
            {EVALUATOR_PRESETS.map((p) => (
              <label key={p.address} className="evaluator-option">
                <input
                  type="radio"
                  name="evaluator"
                  checked={evaluator === p.address}
                  onChange={() => setEvaluator(p.address)}
                />
                <div>
                  <div className="evaluator-name">
                    <span className="ans-name">{p.ansName}<span className="ans-suffix">.arc</span></span>
                  </div>
                  <div className="muted small">{p.description}</div>
                  <a
                    className="evaluator-track-link"
                    href={`#/judge/${p.address}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    view track record →
                  </a>
                </div>
              </label>
            ))}
          </div>
        </label>

        <label>
          <span>Deadline</span>
          <div className="row wrap">
            {DURATIONS.map((d) => (
              <button
                key={d.secs}
                type="button"
                className={`btn ${duration === d.secs ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setDuration(d.secs)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn btn-primary big" disabled={!canSubmit} onClick={create}>
          {busy ? "Creating…" : isConnected ? "Create job" : "Connect wallet first"}
        </button>
      </div>
    </div>
  );
}
