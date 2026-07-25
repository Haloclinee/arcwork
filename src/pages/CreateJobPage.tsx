import { useState } from "react";
import { decodeEventLog, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ERC8183_ADDRESS, erc8183Abi } from "../lib/arc";
import { recordJob } from "../lib/myjobs";

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
  const { writeContractAsync } = useWriteContract();

  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [evaluator, setEvaluator] = useState("");
  const [duration, setDuration] = useState<number>(7 * 86400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerOk = provider.trim() === "" || isAddress(provider.trim());
  const evaluatorOk = isAddress(evaluator.trim());
  const canSubmit =
    isConnected && description.trim().length > 0 && providerOk && evaluatorOk && !busy;

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
          evaluator.trim() as `0x${string}`,
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
      window.location.hash = jobId !== null ? `#/job/${jobId}` : "#/";
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
          <span>Evaluator (required — decides payout vs refund)</span>
          <input
            placeholder="0x… a third party you both trust"
            value={evaluator}
            onChange={(e) => setEvaluator(e.target.value)}
            className={evaluator === "" || evaluatorOk ? "" : "invalid"}
          />
          {address && evaluator.trim().toLowerCase() === address.toLowerCase() && (
            <span className="muted small">
              Heads up: you can't evaluate your own job as the provider — pick a neutral party.
            </span>
          )}
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
