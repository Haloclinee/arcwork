import { useState } from "react";
import { keccak256, toHex } from "viem";
import { usePublicClient } from "wagmi";
import { findDeliverable, getPreimage, type DeliverableProof } from "../lib/deliverable";
import { shortAddr } from "../lib/format";

function hashText(raw: string): `0x${string}` {
  const t = raw.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(t) ? (t as `0x${string}`) : keccak256(toHex(t));
}

export function DeliverablePanel({ jobId }: { jobId: bigint }) {
  const publicClient = usePublicClient();
  const [proof, setProof] = useState<DeliverableProof | "not-found" | "out-of-range" | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyText, setVerifyText] = useState(() => getPreimage(jobId) ?? "");

  async function load() {
    if (!publicClient) return;
    setLoading(true);
    try {
      setProof(await findDeliverable(publicClient, jobId));
    } finally {
      setLoading(false);
    }
  }

  const verified =
    proof !== null && typeof proof === "object" && verifyText.trim() !== ""
      ? hashText(verifyText) === proof.hash
      : null;

  return (
    <div className="action-box">
      <h3>Deliverable proof</h3>
      {proof === null ? (
        <>
          <p className="muted small">
            The deliverable's keccak256 hash is stored on-chain in the JobSubmitted event. Load it
            to verify what was delivered.
          </p>
          <button className="btn btn-ghost" disabled={loading} onClick={load}>
            {loading ? "Scanning chain…" : "Load on-chain proof"}
          </button>
        </>
      ) : proof === "not-found" ? (
        <p className="muted small">No JobSubmitted event found for this job.</p>
      ) : proof === "out-of-range" ? (
        <p className="muted small">
          The submission is older than public RPCs allow scanning (~285k blocks). Verify manually
          against the tx on Arcscan.
        </p>
      ) : (
        <>
          <div className="kv" style={{ marginBottom: 10 }}>
            <span className="muted">On-chain hash</span>
            <span className="mono" style={{ overflowWrap: "anywhere" }}>{proof.hash}</span>
          </div>
          <div className="kv" style={{ marginBottom: 12 }}>
            <span className="muted">Submitted in</span>
            <a
              className="mono"
              href={`https://testnet.arcscan.app/tx/${proof.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddr(proof.txHash)} ↗
            </a>
          </div>
          <div className="row">
            <input
              placeholder="Paste the deliverable text/link to verify…"
              value={verifyText}
              onChange={(e) => setVerifyText(e.target.value)}
            />
          </div>
          {verified !== null && (
            <p className={verified ? "verify-ok" : "verify-bad"}>
              {verified
                ? "✓ Match — this is exactly what the provider submitted."
                : "✗ No match — this text does not hash to the on-chain deliverable."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
