import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { keccak256, toHex } from "viem";
import { ERC8004_REPUTATION_ADDRESS, erc8004ReputationAbi } from "../lib/erc8004";
import { EVALUATOR_PRESETS } from "../lib/presets";

const seenKey = (jobId: bigint, addr: string) => `arcwork:erc8004:feedback:${jobId}:${addr.toLowerCase()}`;

// Writes a feedback record onto Arc's ERC-8004 ReputationRegistry for the
// judge who decided this job — the portable, cross-app counterpart to our
// own JudgeRatings contract. Score is derived from the actual verdict
// (Completed/Rejected), per Arc's own guidance to calculate scores from real
// outcomes rather than a fixed demo value. Per the standard, an agent's own
// owner can't record feedback for itself — only the client or provider here.
export function Erc8004Feedback({
  jobId,
  judge,
  outcome,
}: {
  jobId: bigint;
  judge: `0x${string}`;
  outcome: "Completed" | "Rejected";
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(() => (address ? !!localStorage.getItem(seenKey(jobId, address)) : false));

  const preset = EVALUATOR_PRESETS.find((p) => p.address.toLowerCase() === judge.toLowerCase());

  if (!address || !preset) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const score = outcome === "Completed" ? 100n : 0n;
      const feedbackHash = keccak256(toHex(`arcwork:job:${jobId}:${outcome}`));
      const hash = await writeContractAsync({
        address: ERC8004_REPUTATION_ADDRESS,
        abi: erc8004ReputationAbi,
        functionName: "giveFeedback",
        args: [preset!.agentId, score, 0, "job-outcome", "", "", `arcwork job #${jobId}: ${outcome}`, feedbackHash],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      try {
        localStorage.setItem(seenKey(jobId, address!), "1");
      } catch {
        // best effort only
      }
      setDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-box">
      <h3>Record feedback on Arc's agent registry</h3>
      {done ? (
        <p className="muted small">
          Recorded — this judge's ERC-8004 identity now reflects this job's outcome, visible to any app that reads
          Arc's Reputation Registry, not just arcwork.
        </p>
      ) : (
        <>
          <p className="muted small">
            Separate from arcwork's own judge ratings: this writes a feedback record to Arc's ERC-8004 identity for{" "}
            {preset.ansName} — a portable reputation signal other apps can read too.
          </p>
          <button className="btn btn-ghost" disabled={busy} onClick={submit}>
            {busy ? "Recording…" : "Record ERC-8004 feedback"}
          </button>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
