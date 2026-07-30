import { useReadContract } from "wagmi";
import { zeroAddress } from "viem";
import { ANS_REGISTRY, ansAbi } from "../lib/ans";
import { shortAddr } from "../lib/format";
import { EVALUATOR_PRESETS } from "../lib/presets";

// Resolves an address to its registered ANS name (arcnames.xyz) when one
// exists, falling back to the shortened hex address. A known preset (like
// the Arcwork Judge) resolves instantly without a contract read.
export function Identity({
  address,
  linkToRep,
}: {
  address: string;
  linkToRep?: boolean;
}) {
  const preset = EVALUATOR_PRESETS.find((p) => p.address.toLowerCase() === address.toLowerCase());

  const { data: ansName } = useReadContract({
    address: ANS_REGISTRY,
    abi: ansAbi,
    functionName: "reverseResolve",
    args: [address as `0x${string}`],
    query: { enabled: !preset && address !== zeroAddress, staleTime: 5 * 60_000 },
  });

  if (address === zeroAddress) return <>—</>;

  const label = preset ? preset.ansName : ansName ? ansName : null;
  const display = label ? (
    <span className="ans-name" title={address}>
      {label}<span className="ans-suffix">.arc</span>
    </span>
  ) : (
    <span className="mono">{shortAddr(address)}</span>
  );

  return linkToRep ? <a href={`#/rep/${address}`}>{display}</a> : display;
}
