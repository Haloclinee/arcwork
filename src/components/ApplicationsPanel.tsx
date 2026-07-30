import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWalletClient, useWriteContract } from "wagmi";
import { APPLICATIONS_ADDRESS, applicationsAbi } from "../lib/applications";
import { ERC8183_ADDRESS, erc8183Abi } from "../lib/arc";
import { getXmtpClient } from "../lib/xmtp";
import { Identity } from "./Identity";
import { WinRateBadge } from "./WinRateBadge";
import { Chat } from "./Chat";

// Companion to the canonical ERC-8183 contract — see contracts/JobApplications.sol.
// ERC-8183's setProvider() only accepts calls from the job's client, so this
// small permissionless registry is where any wallet signals interest in an
// open, unassigned job; the client picks from here and still calls the
// canonical setProvider() themselves.
export function ApplicationsPanel({
  jobId,
  isClient,
  clientAddress,
  onAssigned,
}: {
  jobId: bigint;
  isClient: boolean;
  clientAddress: `0x${string}`;
  onAssigned?: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: applicants, refetch: refetchApplicants } = useReadContract({
    address: APPLICATIONS_ADDRESS,
    abi: applicationsAbi,
    functionName: "getApplicants",
    args: [jobId],
  });

  const { data: alreadyApplied, refetch: refetchApplied } = useReadContract({
    address: APPLICATIONS_ADDRESS,
    abi: applicationsAbi,
    functionName: "hasApplied",
    args: [jobId, address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await Promise.all([refetchApplicants(), refetchApplied()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(null);
    }
  }

  const apply = () =>
    run("apply", async () => {
      const hash = await writeContractAsync({
        address: APPLICATIONS_ADDRESS,
        abi: applicationsAbi,
        functionName: "applyToJob",
        args: [jobId],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      // Best-effort: register this wallet's XMTP inbox now, so the client
      // can actually reach them once they open "Message applicant" — XMTP
      // can't DM a wallet that has never created an inbox. A rejected or
      // failed signature here doesn't affect the application itself.
      if (address && walletClient) {
        getXmtpClient(address, walletClient).catch(() => {});
      }
    });

  const withdraw = () =>
    run("withdraw", async () => {
      const hash = await writeContractAsync({
        address: APPLICATIONS_ADDRESS,
        abi: applicationsAbi,
        functionName: "withdraw",
        args: [jobId],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
    });

  const assign = (applicant: `0x${string}`) =>
    run(`assign:${applicant}`, async () => {
      const hash = await writeContractAsync({
        address: ERC8183_ADDRESS,
        abi: erc8183Abi,
        functionName: "setProvider",
        args: [jobId, applicant],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      onAssigned?.();
    });

  return (
    <div className="action-box">
      <h3>Applicants</h3>
      <p className="muted small">
        Anyone can apply to this open job through a small companion registry — the ERC-8183 contract
        itself only lets the client assign a provider, so this is where interest gets collected.
      </p>

      {error && <div className="error">{error}</div>}

      {applicants && applicants.length > 0 ? (
        <ul className="applicant-list">
          {applicants.map((a) => (
            <li key={a}>
              <div className="applicant-info">
                <Identity address={a} />
                <WinRateBadge address={a} />
              </div>
              <div className="applicant-actions">
                {isClient && <Chat peerAddress={a} label="Message applicant" />}
                {isClient && (
                  <button
                    className="btn btn-primary small-btn"
                    disabled={busy !== null}
                    onClick={() => assign(a)}
                  >
                    {busy === `assign:${a}` ? "Assigning…" : "Assign as provider"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No applicants yet.</p>
      )}

      {!isClient && address && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {alreadyApplied && <Chat peerAddress={clientAddress} label="Message client" />}
          {alreadyApplied ? (
            <button className="btn btn-ghost" disabled={busy !== null} onClick={withdraw}>
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw my application"}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy !== null} onClick={apply}>
              {busy === "apply" ? "Applying…" : "Apply for this job"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
