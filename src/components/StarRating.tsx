import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { RATINGS_ADDRESS, ratingsAbi } from "../lib/ratings";

// Lets the connected wallet (client or provider of a judged job) rate the
// judge 1-5 stars via the JudgeRatings companion contract. Shown on the job
// detail page once a verdict has been rendered (Completed/Rejected).
export function StarRating({ jobId }: { jobId: bigint }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(0);

  const { data: alreadyRated, refetch } = useReadContract({
    address: RATINGS_ADDRESS,
    abi: ratingsAbi,
    functionName: "hasRated",
    args: [jobId, address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  async function rate(stars: number) {
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: RATINGS_ADDRESS,
        abi: ratingsAbi,
        functionName: "rateJudge",
        args: [jobId, stars],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await refetch();
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
      <h3>Rate the judge</h3>
      {alreadyRated ? (
        <p className="muted small">You've already rated this judge for this job. Thanks!</p>
      ) : (
        <>
          <p className="muted small">How well did the verdict match the work?</p>
          <div className="stars" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="star-btn"
                disabled={busy}
                onMouseEnter={() => setHover(n)}
                onClick={() => rate(n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                {n <= (hover || 0) ? "★" : "☆"}
              </button>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}

// Compact "★ 4.5 (12)" readout for judge cards / history pages.
export function RatingBadge({ judge }: { judge: `0x${string}` }) {
  const { data } = useReadContract({
    address: RATINGS_ADDRESS,
    abi: ratingsAbi,
    functionName: "judgeStats",
    args: [judge],
  });
  const [count, sum] = data ?? [0n, 0n];
  if (count === 0n) return <span className="muted small">No ratings yet</span>;
  const avg = Number(sum) / Number(count);
  return (
    <span className="rating-badge">
      ★ {avg.toFixed(1)} <span className="muted">({count.toString()})</span>
    </span>
  );
}
