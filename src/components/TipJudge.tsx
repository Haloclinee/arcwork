import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { TIPS_ADDRESS, tipsAbi } from "../lib/tips";
import { arcTestnet } from "../lib/arc";

const PRESETS = ["0.01", "0.05", "0.1"];

// Lets the connected wallet (client or provider of a Completed job) tip the
// judge — in Arc's native currency, which is USDC — via the JudgeTips
// companion contract. The tip goes straight to the judge; arcwork never
// touches it.
export function TipJudge({ jobId }: { jobId: bigint }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function tip() {
    setBusy(true);
    setError(null);
    try {
      const value = parseEther(amount || "0");
      if (value <= 0n) throw new Error("Enter an amount greater than zero.");
      const hash = await writeContractAsync({
        address: TIPS_ADDRESS,
        abi: tipsAbi,
        functionName: "tipJudge",
        args: [jobId],
        value,
        chainId: arcTestnet.id,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setSent(amount);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  if (!address) return null;

  return (
    <div className="action-box">
      <h3>Tip the judge</h3>
      <p className="muted small">
        Happy with the verdict? Send the judge a tip — in USDC, straight to their wallet, nothing
        held by arcwork.
      </p>
      {sent ? (
        <p className="verify-ok">✓ Sent {sent} USDC. Thanks for keeping the judges honest!</p>
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn ${amount === p ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setAmount(p)}
              >
                {p} USDC
              </button>
            ))}
          </div>
          <div className="row">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.05"
              style={{ maxWidth: 120 }}
            />
            <button className="btn btn-primary" disabled={busy} onClick={tip}>
              {busy ? "Sending…" : "Send tip"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}

// Compact "0.32 USDC tipped" readout for judge cards / history pages.
export function TipsBadge({ judge }: { judge: `0x${string}` }) {
  const { data: total } = useReadContract({
    address: TIPS_ADDRESS,
    abi: tipsAbi,
    functionName: "totalTipsReceived",
    args: [judge],
  });
  if (!total || total === 0n) return null;
  return <span className="tips-badge mono">{Number(formatEther(total)).toFixed(2)} USDC tipped</span>;
}
